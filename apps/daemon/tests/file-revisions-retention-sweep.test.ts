import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateFileRevisions, insertFileRevision } from '../src/file-revisions/persistence.js';
import { upsertFileRevisionSnapshot } from '../src/file-revisions/snapshot-storage.js';
import {
  registerRevisionRetentionSweep,
  runDeferredRevisionRetentionForTarget,
  scheduleRevisionRetentionSweep,
} from '../src/file-revisions/retention-sweep.js';

vi.mock('../src/file-revisions/limits.js', () => ({
  FILE_REVISION_PUSH_PRUNE_MAX: 2,
}));

vi.mock('../src/file-revisions/persistence.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/file-revisions/persistence.js')>();
  return {
    ...actual,
    FILE_REVISION_RETENTION_LIMIT: 2,
  };
});

const ROOT = path.join(process.cwd(), '.tmp', 'file-revisions-retention-sweep-test');

afterEach(async () => {
  vi.clearAllMocks();
});

function openDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
  migrateFileRevisions(db);
  return db;
}

describe('file revision deferred retention sweep', () => {
  it('prunes oldest revisions in capped batches without blocking push semantics', async () => {
    const db = openDb();
    const projectsRoot = path.join(ROOT, 'batched');
    const projectDir = path.join(projectsRoot, 'proj-1');
    const revisionsDir = path.join(projectDir, '.od', 'revisions', 'deck.html');
    await mkdir(revisionsDir, { recursive: true });

    for (let sequence = 1; sequence <= 5; sequence += 1) {
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
      await writeFile(path.join(revisionsDir, `${id}.snap.gz`), Buffer.from(`blob-${sequence}`));
    }

    const context = {
      db,
      projectsRoot,
      resolveProjectDir: (_root: string, projectId: string) => path.join(projectsRoot, projectId),
      snapshotContext: { db },
      postgresAuthority: false,
    };

    const first = await runDeferredRevisionRetentionForTarget(
      context,
      'proj-1',
      'deck.html',
      undefined,
      { retentionLimit: 2, maxDeletes: 2 },
    );
    expect(first.pruned).toBe(2);
    expect(first.deferredExcess).toBe(1);
    expect(
      (db.prepare(`SELECT count(*) AS c FROM file_revisions WHERE project_id = 'proj-1'`).get() as { c: number }).c,
    ).toBe(3);

    const second = await runDeferredRevisionRetentionForTarget(
      context,
      'proj-1',
      'deck.html',
      undefined,
      { retentionLimit: 2, maxDeletes: 2 },
    );
    expect(second.pruned).toBe(1);
    expect(second.deferredExcess).toBe(0);
    expect(
      (db.prepare(`SELECT count(*) AS c FROM file_revisions WHERE project_id = 'proj-1'`).get() as { c: number }).c,
    ).toBe(2);

    const remaining = db.prepare(
      `SELECT sequence FROM file_revisions WHERE project_id = 'proj-1' ORDER BY sequence ASC`,
    ).all() as Array<{ sequence: number }>;
    expect(remaining.map((row) => row.sequence)).toEqual([4, 5]);
  });

  it('schedules deferred retention after push without awaiting it', async () => {
    const db = openDb();
    const projectsRoot = path.join(ROOT, 'scheduled');
    registerRevisionRetentionSweep({
      db,
      projectsRoot,
      resolveProjectDir: (_root: string, projectId: string) => path.join(projectsRoot, projectId),
      snapshotContext: { db },
      postgresAuthority: false,
    });

    for (let sequence = 1; sequence <= 4; sequence += 1) {
      insertFileRevision(db, {
        id: `rev-${sequence}`,
        projectId: 'proj-1',
        fileName: 'deck.html',
        parentRevisionId: sequence > 1 ? `rev-${sequence - 1}` : null,
        sequence,
        createdAt: Date.now(),
        byteSize: 10,
        source: 'manual_edit',
        label: `v${sequence}`,
      });
      upsertFileRevisionSnapshot(db, `rev-${sequence}`, Buffer.from(`blob-${sequence}`));
    }

    scheduleRevisionRetentionSweep('proj-1', 'deck.html');
    await expect.poll(
      () => (db.prepare(`SELECT count(*) AS c FROM file_revisions WHERE project_id = 'proj-1'`).get() as { c: number }).c,
      { timeout: 3_000 },
    ).toBe(2);
  });
});
