import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PgFileRevisionRow } from '../src/file-revisions/postgres-persistence.js';
import { pruneOldestFileRevisionsDurableLimited } from '../src/file-revisions/durable-store.js';
import { migrateFileRevisions } from '../src/file-revisions/persistence.js';
import {
  resetDaemonDbRuntimeForTests,
  setDaemonDbRuntimeForTests,
} from '../src/storage/daemon-db-runtime.js';
import {
  createRevisionPostgresMock,
  rowsForFile,
  type RevisionStore,
} from './helpers/file-revisions-postgres-mock.js';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
  migrateFileRevisions(db);
  return db;
}

function revisionRow(
  id: string,
  sequence: number,
  parentRevisionId: string | null,
): PgFileRevisionRow {
  return {
    id,
    projectId: 'proj-1',
    fileName: 'deck.html',
    parentRevisionId,
    sequence,
    createdAt: sequence,
    byteSize: 12,
    source: sequence === 1 ? 'import' : 'manual_edit',
    label: id,
    conversationId: null,
    assistantMessageId: null,
  };
}

function seedRevisionChain(
  db: Database.Database,
  store: RevisionStore,
  count: number,
): PgFileRevisionRow[] {
  const rows: PgFileRevisionRow[] = [];
  for (let sequence = 1; sequence <= count; sequence += 1) {
    const id = `r${sequence}`;
    const parentRevisionId = sequence === 1 ? null : `r${sequence - 1}`;
    const row = revisionRow(id, sequence, parentRevisionId);
    rows.push(row);
    store.revisions.push(row);
    store.snapshots.set(id, Buffer.from(`snap-${id}`));
    db.prepare(`
      INSERT INTO file_revisions (
        id, project_id, file_name, parent_revision_id, sequence, created_at,
        byte_size, source, label, conversation_id, assistant_message_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id,
      row.projectId,
      row.fileName,
      row.parentRevisionId,
      row.sequence,
      row.createdAt,
      row.byteSize,
      row.source,
      row.label,
      row.conversationId,
      row.assistantMessageId,
    );
  }
  return rows;
}

describe('pruneOldestFileRevisionsDurableLimited postgres integration', () => {
  const store: RevisionStore = { revisions: [], snapshots: new Map() };

  afterEach(() => {
    store.revisions = [];
    store.snapshots.clear();
    resetDaemonDbRuntimeForTests();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function setupPostgresAuthority() {
    setDaemonDbRuntimeForTests({
      kind: 'postgres',
      pool: createRevisionPostgresMock(store) as never,
      location: 'test:5432/test',
    });
    vi.stubEnv('OD_DAEMON_DB', 'postgres');
    vi.stubEnv('OD_FILE_REVISION_SNAPSHOT_STORAGE', 'postgres');
  }

  it('deletes chain-safe oldest rows from postgres and sqlite mirror', async () => {
    setupPostgresAuthority();
    const db = openDb();
    seedRevisionChain(db, store, 10);

    const result = await pruneOldestFileRevisionsDurableLimited(
      db,
      'proj-1',
      'deck.html',
      2,
      10,
    );

    expect(result.revisions.map((revision) => revision.id)).toEqual([
      'r1', 'r2', 'r3', 'r4', 'r5',
    ]);
    expect(result.remainingExcess).toBe(3);
    expect(rowsForFile(store, 'proj-1', 'deck.html').map((row) => row.id)).toEqual([
      'r6', 'r7', 'r8', 'r9', 'r10',
    ]);
    const sqliteIds = db.prepare(
      `SELECT id FROM file_revisions ORDER BY sequence ASC`,
    ).all() as Array<{ id: string }>;
    expect(sqliteIds.map((row) => row.id)).toEqual(['r6', 'r7', 'r8', 'r9', 'r10']);
    for (const id of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      expect(store.snapshots.has(id)).toBe(false);
    }
  });

  it('reports stuck excess when checkpoint chain blocks deletion', async () => {
    setupPostgresAuthority();
    const db = openDb();
    seedRevisionChain(db, store, 4);

    const result = await pruneOldestFileRevisionsDurableLimited(
      db,
      'proj-1',
      'deck.html',
      2,
      10,
    );

    expect(result.revisions).toEqual([]);
    expect(result.remainingExcess).toBe(2);
    expect(rowsForFile(store, 'proj-1', 'deck.html').length).toBe(4);
    expect(store.snapshots.size).toBe(4);
  });

  it('respects maxDeletes cap per durable limited pass', async () => {
    setupPostgresAuthority();
    const db = openDb();
    seedRevisionChain(db, store, 10);

    const result = await pruneOldestFileRevisionsDurableLimited(
      db,
      'proj-1',
      'deck.html',
      2,
      2,
    );

    expect(result.revisions.map((revision) => revision.id)).toEqual(['r1', 'r2']);
    expect(result.remainingExcess).toBe(6);
    expect(rowsForFile(store, 'proj-1', 'deck.html').map((row) => row.id)).toEqual([
      'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10',
    ]);
  });
});
