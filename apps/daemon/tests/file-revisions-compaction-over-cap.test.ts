import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/file-revisions/limits.js', () => ({
  FILE_REVISION_MAX_SNAPSHOT_BYTES: 1_000,
  FILE_REVISION_MAX_TOTAL_BYTES: 3_000,
  FILE_REVISION_PUSH_PRUNE_MAX: 2,
  FILE_REVISION_ABSOLUTE_MAX_SNAPSHOT_BYTES: 64 * 1024 * 1024,
  resolveFileRevisionMaxSnapshotBytes: () => 1_000,
  resolveFileRevisionMaxTotalBytes: () => 3_000,
  resolveFileRevisionPushPruneMax: () => 2,
}));

import { runDeferredRevisionSnapshotCompaction } from '../src/file-revisions/compaction.js';
import { migrateFileRevisions, insertFileRevision } from '../src/file-revisions/persistence.js';
import { upsertFileRevisionSnapshot } from '../src/file-revisions/snapshot-storage.js';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
  migrateFileRevisions(db);
  return db;
}

describe('file revision compaction over cap', () => {
  it('prunes oldest snapshots when global byte budget is exceeded', async () => {
    const db = openDb();
    for (let sequence = 1; sequence <= 6; sequence += 1) {
      insertFileRevision(db, {
        id: `rev-${sequence}`,
        projectId: 'proj-1',
        fileName: 'deck.html',
        parentRevisionId: sequence > 1 ? `rev-${sequence - 1}` : null,
        sequence,
        createdAt: sequence,
        byteSize: 1_000,
        source: 'manual_edit',
        label: `v${sequence}`,
      });
      upsertFileRevisionSnapshot(db, `rev-${sequence}`, Buffer.alloc(1_000, 0x61));
    }

    const result = await runDeferredRevisionSnapshotCompaction(db);
    expect(result.pruned).toBeGreaterThan(0);
    expect(result.bytesReclaimed).toBeGreaterThan(0);
    expect(db.prepare(`SELECT count(*) AS c FROM file_revisions`).get()).toEqual({ c: 3 });
  });

  it('respects maxDeletes on push-triggered compaction passes', async () => {
    const db = openDb();
    for (let sequence = 1; sequence <= 6; sequence += 1) {
      insertFileRevision(db, {
        id: `rev-${sequence}`,
        projectId: 'proj-1',
        fileName: 'deck.html',
        parentRevisionId: sequence > 1 ? `rev-${sequence - 1}` : null,
        sequence,
        createdAt: sequence,
        byteSize: 1_000,
        source: 'manual_edit',
        label: `v${sequence}`,
      });
      upsertFileRevisionSnapshot(db, `rev-${sequence}`, Buffer.alloc(1_000, 0x61));
    }

    const result = await runDeferredRevisionSnapshotCompaction(db, { maxDeletes: 2 });
    expect(result.pruned).toBe(2);
    expect(result.deferredOverflowBytes).toBeGreaterThan(0);
    expect(db.prepare(`SELECT count(*) AS c FROM file_revisions`).get()).toEqual({ c: 4 });
  });
});
