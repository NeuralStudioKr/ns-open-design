import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  commitRevisionWithSnapshotDurable,
  ensureFileRevisionsHydrated,
  hydrateFileRevisionsFromPostgres,
} from '../src/file-revisions/durable-store.js';
import { migrateFileRevisions } from '../src/file-revisions/persistence.js';
import {
  resetDaemonDbRuntimeForTests,
  setDaemonDbRuntimeForTests,
} from '../src/storage/daemon-db-runtime.js';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
  migrateFileRevisions(db);
  return db;
}

describe('file-revisions durable postgres authority', () => {
  afterEach(() => {
    resetDaemonDbRuntimeForTests();
    vi.restoreAllMocks();
  });

  it('hydrates sqlite from postgres when head revision ids differ', async () => {
    const db = openDb();
    const pgRows = [
      {
        id: 'rev-1',
        projectId: 'proj-1',
        fileName: 'deck.html',
        parentRevisionId: null,
        sequence: 1,
        createdAt: 1,
        byteSize: 10,
        source: 'import' as const,
        label: 'Baseline',
        conversationId: null,
        assistantMessageId: null,
      },
      {
        id: 'rev-2',
        projectId: 'proj-1',
        fileName: 'deck.html',
        parentRevisionId: 'rev-1',
        sequence: 2,
        createdAt: 2,
        byteSize: 12,
        source: 'manual_edit' as const,
        label: 'Edit',
        conversationId: null,
        assistantMessageId: null,
      },
    ];
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('ORDER BY sequence DESC')) {
        return { rows: [pgRows[1]] };
      }
      if (sql.includes('ORDER BY sequence ASC')) {
        return { rows: pgRows };
      }
      return { rows: [] };
    });
    setDaemonDbRuntimeForTests({
      kind: 'postgres',
      pool: { query } as never,
      location: 'test:5432/test',
    });
    vi.stubEnv('OD_DAEMON_DB', 'postgres');

    await ensureFileRevisionsHydrated(db, 'proj-1', 'deck.html');
    const rows = db.prepare(`SELECT id FROM file_revisions ORDER BY sequence ASC`).all() as Array<{ id: string }>;
    expect(rows.map((row) => row.id)).toEqual(['rev-1', 'rev-2']);
  });

  it('commits revision metadata and snapshot in one durable write', async () => {
    const db = openDb();
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    };
    const connect = vi.fn(async () => client);
    const pool = { connect, query: vi.fn(async () => ({ rows: [] })) };
    setDaemonDbRuntimeForTests({
      kind: 'postgres',
      pool: pool as never,
      location: 'test:5432/test',
    });
    vi.stubEnv('OD_DAEMON_DB', 'postgres');

    const revision = await commitRevisionWithSnapshotDurable(db, {
      id: 'rev-1',
      projectId: 'proj-1',
      fileName: 'deck.html',
      parentRevisionId: null,
      sequence: 1,
      createdAt: Date.now(),
      byteSize: 20,
      source: 'manual_edit',
      label: 'Edit 1',
    }, '<html>hello</html>', { parentContent: null, sequence: 1 });

    expect(revision.id).toBe('rev-1');
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    const sqliteRow = db.prepare(`SELECT id FROM file_revisions WHERE id = ?`).get('rev-1');
    expect(sqliteRow).toBeTruthy();
  });

  it('replaces sqlite mirror on full hydrate', async () => {
    const db = openDb();
    db.prepare(`
      INSERT INTO file_revisions (
        id, project_id, file_name, parent_revision_id, sequence, created_at,
        byte_size, source, label, conversation_id, assistant_message_id
      ) VALUES ('stale', 'proj-1', 'deck.html', NULL, 1, 1, 1, 'import', 'stale', NULL, NULL)
    `).run();
    const pgRows = [{
      id: 'rev-new',
      projectId: 'proj-1',
      fileName: 'deck.html',
      parentRevisionId: null,
      sequence: 1,
      createdAt: 3,
      byteSize: 8,
      source: 'import' as const,
      label: 'Fresh',
      conversationId: null,
      assistantMessageId: null,
    }];
    setDaemonDbRuntimeForTests({
      kind: 'postgres',
      pool: {
        query: vi.fn(async () => ({ rows: pgRows })),
      } as never,
      location: 'test:5432/test',
    });
    vi.stubEnv('OD_DAEMON_DB', 'postgres');

    await hydrateFileRevisionsFromPostgres(db, 'proj-1', 'deck.html');
    const ids = db.prepare(`SELECT id FROM file_revisions`).all() as Array<{ id: string }>;
    expect(ids).toEqual([{ id: 'rev-new' }]);
  });
});
