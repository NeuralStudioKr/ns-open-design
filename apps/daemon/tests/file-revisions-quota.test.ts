import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { enforceFileRevisionGlobalByteBudget, resolveFileRevisionPruneBudgetBytes } from '../src/file-revisions/quota.js';
import { migrateFileRevisions, insertFileRevision } from '../src/file-revisions/persistence.js';
import { upsertFileRevisionSnapshot } from '../src/file-revisions/snapshot-storage.js';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
  migrateFileRevisions(db);
  return db;
}

function insertRevision(
  db: Database.Database,
  id: string,
  sequence: number,
  storageBytes: number,
): void {
  insertFileRevision(db, {
    id,
    projectId: 'proj-1',
    fileName: 'deck.html',
    parentRevisionId: sequence > 1 ? `rev-${sequence - 1}` : null,
    sequence,
    createdAt: sequence,
    byteSize: storageBytes,
    source: 'manual_edit',
    label: `v${sequence}`,
  });
  upsertFileRevisionSnapshot(db, id, Buffer.alloc(storageBytes, 0x61));
}

describe('file revision global byte budget', () => {
  it('is a no-op when budget is disabled', async () => {
    const db = openDb();
    insertRevision(db, 'rev-1', 1, 1000);
    const result = await enforceFileRevisionGlobalByteBudget(db, 500, 0);
    expect(result).toEqual({ pruned: 0, bytesReclaimed: 0, deferredOverflowBytes: 0 });
    expect(db.prepare(`SELECT count(*) AS c FROM file_revisions`).get()).toEqual({ c: 1 });
  });

  it('prunes oldest revisions until incoming bytes fit the budget', async () => {
    const db = openDb();
    insertRevision(db, 'rev-1', 1, 400);
    insertRevision(db, 'rev-2', 2, 400);
    insertRevision(db, 'rev-3', 3, 400);

    const result = await enforceFileRevisionGlobalByteBudget(db, 300, 900);
    expect(result.pruned).toBe(2);
    expect(result.bytesReclaimed).toBe(800);
    expect(result.deferredOverflowBytes).toBe(0);
    const remaining = db.prepare(`SELECT id FROM file_revisions ORDER BY sequence ASC`).all() as Array<{ id: string }>;
    expect(remaining.map((row) => row.id)).toEqual(['rev-3']);
  });

  it('uses the soft snapshot target when no global budget is configured', () => {
    expect(resolveFileRevisionPruneBudgetBytes(200)).toBe(8 * 1024 * 1024);
    expect(resolveFileRevisionPruneBudgetBytes(20 * 1024 * 1024)).toBe(20 * 1024 * 1024);
  });

  it('defers remaining overflow when synchronous delete cap is reached', async () => {
    const db = openDb();
    insertRevision(db, 'rev-1', 1, 400);
    insertRevision(db, 'rev-2', 2, 400);
    insertRevision(db, 'rev-3', 3, 400);

    const result = await enforceFileRevisionGlobalByteBudget(
      db,
      300,
      900,
      new Set(['rev-3']),
      { maxDeletes: 1 },
    );
    expect(result.pruned).toBe(1);
    expect(result.bytesReclaimed).toBe(400);
    expect(result.deferredOverflowBytes).toBe(200);
    const remaining = db.prepare(`SELECT id FROM file_revisions ORDER BY sequence ASC`).all() as Array<{ id: string }>;
    expect(remaining.map((row) => row.id)).toEqual(['rev-2', 'rev-3']);
  });
});
