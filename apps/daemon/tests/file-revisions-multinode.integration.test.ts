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
import {
  createRevisionPostgresMock,
  type RevisionStore,
} from './helpers/file-revisions-postgres-mock.js';

const ROOT = path.join(process.cwd(), '.tmp', 'file-revisions-multinode-test');

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
