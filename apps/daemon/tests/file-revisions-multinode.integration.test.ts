import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PgFileRevisionRow } from '../src/file-revisions/postgres-persistence.js';
import { createFileRevisionService } from '../src/file-revisions/service.js';
import { migrateFileRevisions } from '../src/file-revisions/persistence.js';
import {
  readProjectFile,
  resolveProjectDir,
  writeProjectFile,
} from '../src/projects.js';
import {
  resetDaemonDbRuntimeForTests,
  setDaemonDbRuntimeForTests,
} from '../src/storage/daemon-db-runtime.js';

const ROOT = path.join(process.cwd(), '.tmp', 'file-revisions-multinode-test');

interface RevisionStore {
  revisions: PgFileRevisionRow[];
  snapshots: Map<string, Buffer>;
}

function rowsForFile(store: RevisionStore, projectId: string, fileName: string): PgFileRevisionRow[] {
  return store.revisions
    .filter((row) => row.projectId === projectId && row.fileName === fileName)
    .sort((a, b) => a.sequence - b.sequence);
}

function parseRevisionInsert(params: unknown[]): PgFileRevisionRow {
  const [
    id,
    projectId,
    fileName,
    parentRevisionId,
    sequence,
    createdAt,
    byteSize,
    source,
    label,
    conversationId,
    assistantMessageId,
  ] = params as [
    string,
    string,
    string,
    string | null,
    number,
    number,
    number,
    PgFileRevisionRow['source'],
    string,
    string | null,
    string | null,
  ];
  return {
    id,
    projectId,
    fileName,
    parentRevisionId,
    sequence,
    createdAt,
    byteSize,
    source,
    label,
    conversationId,
    assistantMessageId,
  };
}

function createRevisionPostgresMock(store: RevisionStore) {
  const createClient = () => {
    const tx = {
      revisions: [] as PgFileRevisionRow[],
      snapshots: [] as Array<{ revisionId: string; compressed: Buffer }>,
    };
    let inTx = false;

    const applyTx = () => {
      for (const row of tx.revisions) {
        const index = store.revisions.findIndex((entry) => entry.id === row.id);
        if (index >= 0) store.revisions[index] = row;
        else store.revisions.push(row);
      }
      for (const snapshot of tx.snapshots) {
        store.snapshots.set(snapshot.revisionId, snapshot.compressed);
      }
      tx.revisions = [];
      tx.snapshots = [];
    };

    return {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql === 'BEGIN') {
          inTx = true;
          return { rows: [] };
        }
        if (sql === 'ROLLBACK') {
          inTx = false;
          tx.revisions = [];
          tx.snapshots = [];
          return { rows: [] };
        }
        if (sql === 'COMMIT') {
          if (inTx) applyTx();
          inTx = false;
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO file_revisions')) {
          const row = parseRevisionInsert(params);
          if (inTx) tx.revisions.push(row);
          else {
            store.revisions.push(row);
          }
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO file_revision_snapshots')) {
          const [revisionId, compressed] = params as [string, Buffer];
          if (inTx) {
            tx.snapshots.push({ revisionId, compressed });
          } else {
            store.snapshots.set(revisionId, compressed);
          }
          return { rows: [] };
        }
        if (sql.includes('DELETE FROM file_revision_snapshots')) {
          const [ids] = params as [string[]];
          for (const id of ids) store.snapshots.delete(id);
          return { rows: [] };
        }
        if (sql.includes('DELETE FROM file_revisions WHERE id = ANY')) {
          const [ids] = params as [string[]];
          store.revisions = store.revisions.filter((row) => !ids.includes(row.id));
          return { rows: [] };
        }
        if (sql.includes('DELETE FROM file_revisions') && sql.includes('sequence >')) {
          const [projectId, fileName, sequence] = params as [string, string, number];
          const removed = store.revisions.filter(
            (row) => row.projectId === projectId && row.fileName === fileName && row.sequence > sequence,
          );
          const ids = removed.map((row) => row.id);
          store.revisions = store.revisions.filter((row) => !ids.includes(row.id));
          for (const id of ids) store.snapshots.delete(id);
          return { rows: [] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
  };

  const poolQuery = async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('SET lock_timeout')) return { rows: [] };
    if (sql.includes('pg_advisory_lock') || sql.includes('pg_advisory_unlock')) {
      return { rows: [] };
    }
    if (sql.includes('count(*)::text AS c FROM file_revisions') && !sql.includes('file_revision_snapshots')) {
      const [projectId, fileName] = params as [string, string];
      const count = rowsForFile(store, projectId, fileName).length;
      return { rows: [{ c: String(count) }] };
    }
    if (sql.includes('count(*)::text AS c FROM file_revisions') && sql.includes('DISTINCT')) {
      return { rows: [{ c: String(store.revisions.length) }] };
    }
    if (sql.includes('SELECT id FROM file_revisions') && sql.includes('sequence >')) {
      const [projectId, fileName, sequence] = params as [string, string, number];
      const ids = rowsForFile(store, projectId, fileName)
        .filter((row) => row.sequence > sequence)
        .map((row) => row.id);
      return { rows: ids.map((id) => ({ id })) };
    }
    if (sql.includes('SELECT id FROM file_revisions') && sql.includes('ORDER BY sequence DESC')) {
      const [projectId, fileName, keep] = params as [string, string, number];
      const ids = [...rowsForFile(store, projectId, fileName)]
        .sort((a, b) => b.sequence - a.sequence)
        .slice(keep)
        .map((row) => row.id);
      return { rows: ids.map((id) => ({ id })) };
    }
    if (sql.includes('SELECT id FROM file_revisions') && !sql.includes('WHERE project_id')) {
      return { rows: store.revisions.map((row) => ({ id: row.id })) };
    }
    if (sql.includes('ORDER BY sequence DESC') && sql.includes('LIMIT 1')) {
      const [projectId, fileName] = params as [string, string];
      const head = [...rowsForFile(store, projectId, fileName)].pop();
      return { rows: head ? [head] : [] };
    }
    if (sql.includes('ORDER BY sequence ASC') && sql.includes('file_revisions')) {
      const [projectId, fileName] = params as [string, string];
      return { rows: rowsForFile(store, projectId, fileName) };
    }
    if (sql.includes('SELECT compressed FROM file_revision_snapshots')) {
      const [revisionId] = params as [string];
      const compressed = store.snapshots.get(revisionId);
      return { rows: compressed ? [{ compressed }] : [] };
    }
    if (sql.includes('SELECT DISTINCT project_id')) {
      const [projectId] = params as [string];
      const files = new Set(
        store.revisions
          .filter((row) => row.projectId === projectId)
          .map((row) => row.fileName),
      );
      return {
        rows: [...files].map((fileName) => ({ projectId, fileName })),
      };
    }
    if (sql.includes('FROM file_revision_snapshots s') && sql.includes('LEFT JOIN file_revisions')) {
      const orphans = [...store.snapshots.keys()].filter(
        (id) => !store.revisions.some((row) => row.id === id),
      );
      return {
        rows: orphans.map((id) => ({
          id,
          storageBytes: store.snapshots.get(id)?.length ?? 0,
        })),
      };
    }
    if (sql.includes('count(*)::text AS c FROM file_revision_snapshots')) {
      if (sql.includes('WHERE r.id IS NULL')) {
        const orphanCount = [...store.snapshots.keys()].filter(
          (id) => !store.revisions.some((row) => row.id === id),
        ).length;
        return { rows: [{ c: String(orphanCount) }] };
      }
      return { rows: [{ c: String(store.snapshots.size) }] };
    }
    if (sql.includes('coalesce(sum(storage_bytes)')) {
      const total = [...store.snapshots.values()].reduce((sum, buf) => sum + buf.length, 0);
      return { rows: [{ total: String(total) }] };
    }
    return { rows: [] };
  };

  return {
    connect: vi.fn(async () => createClient()),
    query: vi.fn(poolQuery),
  };
}

function openNodeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
  migrateFileRevisions(db);
  return db;
}

describe('file-revisions multinode postgres integration', () => {
  const store: RevisionStore = { revisions: [], snapshots: new Map() };
  let projectsRoot: string;
  let projectDir: string;

  beforeEach(async () => {
    store.revisions = [];
    store.snapshots.clear();
    projectsRoot = path.join(ROOT, String(Date.now()));
    projectDir = path.join(projectsRoot, 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, 'deck.html'),
      '<!doctype html><html><body><h1>v0</h1></body></html>',
      'utf8',
    );
    setDaemonDbRuntimeForTests({
      kind: 'postgres',
      pool: createRevisionPostgresMock(store) as never,
      location: 'test:5432/test',
    });
    vi.stubEnv('OD_DAEMON_DB', 'postgres');
  });

  afterEach(() => {
    resetDaemonDbRuntimeForTests();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function createNodeService(db: Database.Database) {
    return createFileRevisionService({
      db,
      projectsRoot,
      writeProjectFile,
      readProjectFile,
      resolveProjectDir,
    });
  }

  it('node B lists revisions after node A push via shared Postgres SSOT', async () => {
    const nodeA = createNodeService(openNodeDb());
    const nodeB = createNodeService(openNodeDb());

    const pushed = await nodeA.pushRevision({
      projectId: 'proj-1',
      fileName: 'deck.html',
      content: '<!doctype html><html><body><h1>v1</h1></body></html>',
      source: 'manual_edit',
      label: 'Edit 1',
    });
    expect(pushed.revision.sequence).toBeGreaterThanOrEqual(2);

    const listed = await nodeB.listRevisions('proj-1', 'deck.html');
    expect(listed.revisions.map((revision) => revision.id)).toContain(pushed.revision.id);
    expect(listed.headRevisionId).toBe(pushed.revision.id);

    const content = await nodeB.getRevisionContent('proj-1', 'deck.html', pushed.revision.id);
    expect(content?.content).toContain('v1');
  });

  it('node B drops stale sqlite rows after node A truncates redo branch', async () => {
    const nodeA = createNodeService(openNodeDb());
    const nodeB = createNodeService(openNodeDb());

    const push1 = await nodeA.pushRevision({
      projectId: 'proj-1',
      fileName: 'deck.html',
      content: '<!doctype html><html><body><h1>v1</h1></body></html>',
      source: 'manual_edit',
      label: 'Edit 1',
    });
    const push2 = await nodeA.pushRevision({
      projectId: 'proj-1',
      fileName: 'deck.html',
      content: '<!doctype html><html><body><h1>v2</h1></body></html>',
      source: 'manual_edit',
      label: 'Edit 2',
    });

    await nodeB.listRevisions('proj-1', 'deck.html');
    const baseline = (await nodeB.listRevisions('proj-1', 'deck.html')).revisions[0]!;

    await nodeA.pushRevision({
      projectId: 'proj-1',
      fileName: 'deck.html',
      content: '<!doctype html><html><body><h1>v3</h1></body></html>',
      source: 'manual_edit',
      label: 'Edit 3',
      truncateAfterSequence: baseline.sequence,
    });

    const listed = await nodeB.listRevisions('proj-1', 'deck.html');
    expect(listed.revisions.some((revision) => revision.id === push1.revision.id)).toBe(false);
    expect(listed.revisions.some((revision) => revision.id === push2.revision.id)).toBe(false);
    expect(listed.headRevisionId).not.toBe(push2.revision.id);
  });

  it('node B restore reads snapshot bytes committed by node A', async () => {
    const nodeA = createNodeService(openNodeDb());
    const nodeB = createNodeService(openNodeDb());

    const pushed = await nodeA.pushRevision({
      projectId: 'proj-1',
      fileName: 'deck.html',
      content: '<!doctype html><html><body><h1>restored</h1></body></html>',
      source: 'manual_edit',
      label: 'Restore me',
    });

    const restored = await nodeB.restoreRevision({
      projectId: 'proj-1',
      fileName: 'deck.html',
      revisionId: pushed.revision.id,
    });
    expect(restored?.file.name).toBe('deck.html');

    const raw = await readProjectFile(projectsRoot, 'proj-1', 'deck.html');
    expect(raw.buffer.toString('utf8')).toContain('restored');
  });
});
