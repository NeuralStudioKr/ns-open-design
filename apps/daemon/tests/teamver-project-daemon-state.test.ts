import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeDatabase,
  getConversation,
  getProject,
  insertConversation,
  insertProject,
  listMessages,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import {
  applyTeamverProjectDaemonState,
  buildTeamverProjectDaemonState,
  exportTeamverProjectDaemonState,
  importTeamverProjectDaemonState,
  resetTeamverProjectDaemonStateExportThrottleForTests,
} from '../src/teamver-project-daemon-state.js';
import { LocalProjectStorage } from '../src/storage/project-storage.js';
import { TenantScopedProjectStorage } from '../src/storage/tenant-scoped-project-storage.js';

describe('teamver project daemon state', () => {
  afterEach(() => {
    resetTeamverProjectDaemonStateExportThrottleForTests();
  });

  it('round-trips conversations and messages through tenant S3 storage', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-daemon-state-'));
    const db = openDatabase(root, { dataDir: path.join(root, '.od') });
    const projectId = 'proj-roundtrip';
    const conversationId = 'conv-1';
    const now = Date.now();

    insertProject(db, {
      id: projectId,
      name: 'Deck',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
      customInstructions: null,
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: conversationId,
      projectId,
      title: 'Main',
      sessionMode: 'design',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, conversationId, {
      id: 'msg-1',
      role: 'assistant',
      content: 'Hello from node A',
      createdAt: now,
      endedAt: now,
    });

    const remote = new TenantScopedProjectStorage(
      new LocalProjectStorage(path.join(root, 'remote')),
      'tenant/prefix',
    );

    try {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      await exportTeamverProjectDaemonState(db, remote, projectId);

      const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'od-daemon-state-target-'));
      const targetDb = openDatabase(targetRoot, { dataDir: path.join(targetRoot, '.od') });
      try {
        const imported = await importTeamverProjectDaemonState(targetDb, remote, projectId);
        expect(imported).toBe(true);
        expect(getProject(targetDb, projectId)?.name).toBe('Deck');
        expect(getConversation(targetDb, conversationId)?.title).toBe('Main');
        expect(listMessages(targetDb, conversationId)).toHaveLength(1);
        expect(listMessages(targetDb, conversationId)[0]?.content).toBe('Hello from node A');
      } finally {
        closeDatabase(targetDb);
        fs.rmSync(targetRoot, { recursive: true, force: true });
      }
    } finally {
      closeDatabase(db);
      fs.rmSync(root, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });

  it('does not apply a stale remote snapshot over newer local rows', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-daemon-state-stale-'));
    const db = openDatabase(root, { dataDir: path.join(root, '.od') });
    const projectId = 'proj-stale';
    const conversationId = 'conv-1';
    const older = Date.now() - 60_000;
    const newer = Date.now();

    insertProject(db, {
      id: projectId,
      name: 'Local Newer',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
      customInstructions: null,
      createdAt: newer,
      updatedAt: newer,
    });
    insertConversation(db, {
      id: conversationId,
      projectId,
      title: 'Local thread',
      sessionMode: 'design',
      createdAt: newer,
      updatedAt: newer,
    });

    const staleState = buildTeamverProjectDaemonState(db, projectId);
    expect(staleState).not.toBeNull();
    staleState!.exportedAt = older;
    staleState!.project.name = 'Remote Older';
    staleState!.conversations[0]!.title = 'Remote thread';

    const applied = applyTeamverProjectDaemonState(db, staleState!);
    expect(applied).toBe(false);
    expect(getProject(db, projectId)?.name).toBe('Local Newer');
    expect(getConversation(db, conversationId)?.title).toBe('Local thread');

    closeDatabase(db);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('imports remote conversations when local sqlite only has a registry-hydrated project row', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-daemon-state-empty-local-'));
    const db = openDatabase(root, { dataDir: path.join(root, '.od') });
    const projectId = 'proj-empty-local';
    const conversationId = 'conv-remote';
    const registryUpdatedAt = Date.now();
    const olderExportAt = registryUpdatedAt - 60_000;

    insertProject(db, {
      id: projectId,
      name: 'Hydrated only',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
      customInstructions: null,
      createdAt: registryUpdatedAt,
      updatedAt: registryUpdatedAt,
    });

    const remoteState: NonNullable<ReturnType<typeof buildTeamverProjectDaemonState>> = {
      version: 1,
      projectId,
      exportedAt: olderExportAt,
      project: {
        id: projectId,
        name: 'Hydrated only',
        skillId: null,
        designSystemId: null,
        createdAt: registryUpdatedAt - 120_000,
        updatedAt: registryUpdatedAt - 120_000,
      },
      conversations: [
        {
          id: conversationId,
          projectId,
          title: 'Remote thread',
          sessionMode: 'design',
          createdAt: olderExportAt,
          updatedAt: olderExportAt,
        },
      ],
      messages: [
        {
          conversationId,
          message: {
            id: 'msg-remote',
            role: 'assistant',
            content: 'from S3',
            createdAt: olderExportAt,
            endedAt: olderExportAt,
          },
        },
      ],
      agentSessions: [],
    };

    expect(applyTeamverProjectDaemonState(db, remoteState)).toBe(true);
    expect(getConversation(db, conversationId)?.title).toBe('Remote thread');
    expect(listMessages(db, conversationId)[0]?.content).toBe('from S3');

    closeDatabase(db);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
