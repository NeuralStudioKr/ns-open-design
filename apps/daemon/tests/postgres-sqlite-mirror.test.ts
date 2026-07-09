import { afterEach, describe, expect, it, vi } from 'vitest';

import { closeDatabase, insertConversation, insertProject, openDatabase } from '../src/db.js';
import { migratePlugins } from '../src/plugins/persistence.js';
import { createSnapshot } from '../src/plugins/snapshots.js';
import {
  resetDaemonDbRuntimeForTests,
  setDaemonDbRuntimeForTests,
} from '../src/storage/daemon-db-runtime.js';

describe('postgres sqlite mirror for plugin FK tables', () => {
  afterEach(() => {
    resetDaemonDbRuntimeForTests();
    closeDatabase();
    vi.restoreAllMocks();
  });

  it('mirrors project + conversation rows so plugin snapshots can insert', () => {
    const db = openDatabase('/tmp/postgres-sqlite-mirror-test');
    migratePlugins(db);
    setDaemonDbRuntimeForTests({
      kind: 'postgres',
      pool: { query: vi.fn(async () => ({ rows: [] })) } as never,
      location: 'test:5432/test',
    });

    const now = Date.now();
    const projectId = 'proj-mirror-1';
    insertProject(db, {
      id: projectId,
      name: 'Mirror test',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      createdAt: now,
      updatedAt: now,
    });
    const conversationId = 'conv-mirror-1';
    insertConversation(db, {
      id: conversationId,
      projectId,
      title: null,
      sessionMode: 'design',
      createdAt: now,
      updatedAt: now,
    });

    expect(() =>
      createSnapshot(db, {
        projectId,
        conversationId,
        pluginId: 'od-new-generation',
        pluginVersion: '1.0.0',
        manifestSourceDigest: 'digest',
        taskKind: 'new-generation',
        inputs: {},
        resolvedContext: { skills: [], designSystems: [], craft: [], atoms: [], scenarios: [] },
        capabilitiesGranted: [],
        capabilitiesRequired: [],
        assetsStaged: [],
        connectorsRequired: [],
        connectorsResolved: [],
        mcpServers: [],
      }),
    ).not.toThrow();

    const sqliteProject = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    expect(sqliteProject).toBeTruthy();
  });
});
