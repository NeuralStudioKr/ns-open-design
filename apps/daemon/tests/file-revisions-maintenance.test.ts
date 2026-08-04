import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateFileRevisions, insertFileRevision } from '../src/file-revisions/persistence.js';
import {
  collectFileRevisionStorageStats,
  runFileRevisionGc,
} from '../src/file-revisions/maintenance.js';
import { upsertFileRevisionSnapshot, pruneOrphanFileRevisionSnapshotsDurable } from '../src/file-revisions/snapshot-storage.js';
import { enforceFileRevisionGlobalByteBudget } from '../src/file-revisions/quota.js';

const ROOT = path.join(process.cwd(), '.tmp', 'file-revisions-maintenance-test');

afterEach(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

function openDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
  migrateFileRevisions(db);
  return db;
}

describe('file-revisions maintenance', () => {
  it('removes orphan snapshot rows without metadata', async () => {
    const db = openDb();
    db.pragma('foreign_keys = OFF');
    upsertFileRevisionSnapshot(db, 'orphan-rev', Buffer.from('blob'));
    db.pragma('foreign_keys = ON');
    const result = await pruneOrphanFileRevisionSnapshotsDurable(db);
    expect(result.removed).toBe(1);
    const stats = await collectFileRevisionStorageStats(db);
    expect(stats.snapshotRowCount).toBe(0);
    expect(stats.orphanSnapshotRowCount).toBe(0);
  });

  it('enforces retention and deletes orphan files on disk', async () => {
    const db = openDb();
    const projectsRoot = path.join(ROOT, 'projects');
    const projectDir = path.join(projectsRoot, 'proj-1');
    const revisionsDir = path.join(projectDir, '.od', 'revisions', 'deck.html');
    await mkdir(revisionsDir, { recursive: true });

    for (let sequence = 1; sequence <= 10; sequence += 1) {
      const id = `rev-${sequence}`;
      insertFileRevision(db, {
        id,
        projectId: 'proj-1',
        fileName: 'deck.html',
        parentRevisionId: sequence > 1 ? `rev-${sequence - 1}` : null,
        sequence,
        createdAt: Date.now(),
        byteSize: 10,
        source: 'manual_edit',
        label: `v${sequence}`,
      });
      upsertFileRevisionSnapshot(db, id, Buffer.from(`blob-${sequence}`));
      await writeFile(path.join(revisionsDir, `${id}.snap.gz`), Buffer.from('legacy'));
    }
    await writeFile(path.join(revisionsDir, 'stale.snap.gz'), Buffer.from('stale'));

    const result = await runFileRevisionGc({
      db,
      projectsRoot,
      resolveProjectDir: (projectId) => path.join(projectsRoot, projectId),
      retentionLimit: 2,
      vacuumSqlite: false,
    });

    expect(result.retentionRevisionsPruned).toBe(5);
    expect(result.orphanFilesRemoved).toBe(1);
    const stats = await collectFileRevisionStorageStats(db);
    expect(stats.snapshotRowCount).toBe(5);
  });

  it('global byte budget pruning removes oldest revisions first', async () => {
    const db = openDb();
    for (let sequence = 1; sequence <= 3; sequence += 1) {
      const id = `rev-${sequence}`;
      insertFileRevision(db, {
        id,
        projectId: 'proj-1',
        fileName: 'deck.html',
        parentRevisionId: sequence > 1 ? `rev-${sequence - 1}` : null,
        sequence,
        createdAt: sequence,
        byteSize: 100,
        source: 'manual_edit',
        label: `v${sequence}`,
      });
      upsertFileRevisionSnapshot(db, id, Buffer.alloc(400, 0x62));
    }

    const budget = await enforceFileRevisionGlobalByteBudget(db, 0, 900);
    expect(budget.pruned).toBe(1);
    expect(budget.bytesReclaimed).toBe(400);

    const stats = await collectFileRevisionStorageStats(db);
    expect(stats.snapshotRowCount).toBe(2);
    expect(stats.revisionRowCount).toBe(2);
  });
});
