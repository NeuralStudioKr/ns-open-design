import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
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

describe('file revision deferred compaction', () => {
  it('is a no-op when storage is below the soft cap', async () => {
    const db = openDb();
    insertFileRevision(db, {
      id: 'rev-1',
      projectId: 'proj-1',
      fileName: 'deck.html',
      parentRevisionId: null,
      sequence: 1,
      createdAt: 1,
      byteSize: 100,
      source: 'import',
      label: 'Baseline',
    });
    upsertFileRevisionSnapshot(db, 'rev-1', Buffer.alloc(100, 0x61));
    const result = await runDeferredRevisionSnapshotCompaction(db);
    expect(result.pruned).toBe(0);
  });
});
