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
    upsertFileRevisionSnapshot(db, 'orphan-rev', Buffer.from('blob'));
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

    for (let sequence = 1; sequence <= 4; sequence += 1) {
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

    expect(result.retentionRevisionsPruned).toBe(2);
    expect(result.orphanFilesRemoved).toBe(1);
    const stats = await collectFileRevisionStorageStats(db);
    expect(stats.snapshotRowCount).toBe(2);
  });
});
