import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';

import {
  getConversation,
  getProject,
  insertConversation,
  insertProject,
  listMessages,
  updateConversation,
  updateProject,
  upsertAgentSession,
  upsertMessage,
} from './db.js';
import { isTeamverDesignManaged } from './teamver-project-access.js';
import { isDaemonDbPostgres } from './storage/daemon-db-runtime.js';
import type { ProjectStorage } from './storage/project-storage.js';
import type { ProjectStorageAccessHooks } from './storage/lazy-project-materialization.js';
import {
  readTeamverProjectDaemonStateFromRemote,
  writeTeamverProjectDaemonStateToRemote,
} from './teamver-project-daemon-state-store.js';

export {
  TEAMVER_PROJECT_DAEMON_STATE_RELPATH,
  isTeamverDaemonStateRelpath,
} from './teamver-project-daemon-state-store.js';

type SqliteDb = Database.Database;

export type TeamverProjectDaemonStateV1 = {
  version: 1;
  projectId: string;
  exportedAt: number;
  project: {
    id: string;
    name: string;
    skillId: string | null;
    designSystemId: string | null;
    pendingPrompt?: string | null;
    metadata?: Record<string, unknown>;
    customInstructions?: string | null;
    createdAt: number;
    updatedAt: number;
  };
  conversations: Array<{
    id: string;
    projectId: string;
    title: string | null;
    sessionMode: string;
    createdAt: number;
    updatedAt: number;
  }>;
  messages: Array<{
    conversationId: string;
    message: Record<string, unknown>;
  }>;
  agentSessions: Array<{
    conversationId: string;
    agentId: string;
    sessionId: string;
    stablePromptHash: string | null;
    updatedAt: number;
  }>;
};

function readProjectDaemonStateWatermark(db: SqliteDb, projectId: string): number {
  const project = getProject(db, projectId);
  let watermark = project?.updatedAt ?? 0;
  const conversations = db
    .prepare(`SELECT updated_at AS updatedAt FROM conversations WHERE project_id = ?`)
    .all(projectId) as Array<{ updatedAt: number }>;
  for (const row of conversations) {
    watermark = Math.max(watermark, Number(row.updatedAt) || 0);
  }
  return watermark;
}

function listProjectConversationRows(db: SqliteDb, projectId: string) {
  return db
    .prepare(
      `SELECT id, project_id AS projectId, title, session_mode AS sessionMode,
              created_at AS createdAt, updated_at AS updatedAt
         FROM conversations
        WHERE project_id = ?
        ORDER BY updated_at DESC`,
    )
    .all(projectId) as TeamverProjectDaemonStateV1['conversations'];
}

function listProjectAgentSessionRows(db: SqliteDb, projectId: string) {
  return db
    .prepare(
      `SELECT s.conversation_id AS conversationId,
              s.agent_id AS agentId,
              s.session_id AS sessionId,
              s.stable_prompt_hash AS stablePromptHash,
              s.updated_at AS updatedAt
         FROM agent_sessions s
         JOIN conversations c ON c.id = s.conversation_id
        WHERE c.project_id = ?`,
    )
    .all(projectId) as TeamverProjectDaemonStateV1['agentSessions'];
}

export function buildTeamverProjectDaemonState(
  db: SqliteDb,
  projectId: string,
): TeamverProjectDaemonStateV1 | null {
  const trimmed = projectId.trim();
  if (!trimmed) return null;
  const project = getProject(db, trimmed);
  if (!project) return null;

  const conversations = listProjectConversationRows(db, trimmed);
  const messages: TeamverProjectDaemonStateV1['messages'] = [];
  for (const conversation of conversations) {
    for (const message of listMessages(db, conversation.id)) {
      messages.push({
        conversationId: conversation.id,
        message: { ...message },
      });
    }
  }

  return {
    version: 1,
    projectId: trimmed,
    exportedAt: Date.now(),
    project: {
      id: project.id,
      name: project.name,
      skillId: project.skillId ?? null,
      designSystemId: project.designSystemId ?? null,
      pendingPrompt: project.pendingPrompt ?? null,
      metadata: project.metadata ?? undefined,
      customInstructions: project.customInstructions ?? null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    conversations,
    messages,
    agentSessions: listProjectAgentSessionRows(db, trimmed),
  };
}

function readMessageWatermark(message: Record<string, unknown>): number {
  const endedAt = Number(message.endedAt);
  if (Number.isFinite(endedAt) && endedAt > 0) return endedAt;
  const createdAt = Number(message.createdAt);
  if (Number.isFinite(createdAt) && createdAt > 0) return createdAt;
  return 0;
}

function shouldApplyRemoteMessage(
  db: SqliteDb,
  message: Record<string, unknown>,
): boolean {
  const id = typeof message.id === 'string' ? message.id : '';
  if (!id) return false;
  const remoteAt = readMessageWatermark(message);
  const existing = db
    .prepare(`SELECT ended_at AS endedAt, created_at AS createdAt FROM messages WHERE id = ?`)
    .get(id) as { endedAt?: number | null; createdAt?: number | null } | undefined;
  if (!existing) return true;
  const localAt = Number(existing.endedAt ?? existing.createdAt ?? 0);
  return remoteAt >= localAt;
}

function readLocalConversationCount(db: SqliteDb, projectId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM conversations WHERE project_id = ?`)
    .get(projectId) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

function shouldApplyRemoteDaemonState(
  db: SqliteDb,
  state: TeamverProjectDaemonStateV1,
): boolean {
  const projectId = state.projectId.trim();
  if (!projectId) return false;
  const localConversationCount = readLocalConversationCount(db, projectId);
  if (localConversationCount === 0 && state.conversations.length > 0) {
    return true;
  }
  const localWatermark = readProjectDaemonStateWatermark(db, projectId);
  return state.exportedAt >= localWatermark;
}

export function applyTeamverProjectDaemonState(
  db: SqliteDb,
  state: TeamverProjectDaemonStateV1,
): boolean {
  const projectId = state.projectId.trim();
  if (!projectId || state.version !== 1) return false;

  if (!shouldApplyRemoteDaemonState(db, state)) return false;

  const existingProject = getProject(db, projectId);
  const remoteProject = state.project;
  if (!existingProject) {
    insertProject(db, {
      id: remoteProject.id,
      name: remoteProject.name,
      skillId: remoteProject.skillId,
      designSystemId: remoteProject.designSystemId,
      pendingPrompt: remoteProject.pendingPrompt ?? null,
      metadata: remoteProject.metadata ?? { kind: 'prototype' },
      customInstructions: remoteProject.customInstructions ?? null,
      createdAt: remoteProject.createdAt,
      updatedAt: remoteProject.updatedAt,
    });
  } else if (remoteProject.updatedAt >= existingProject.updatedAt) {
    updateProject(db, projectId, {
      name: remoteProject.name,
      skillId: remoteProject.skillId,
      designSystemId: remoteProject.designSystemId,
      pendingPrompt: remoteProject.pendingPrompt ?? null,
      metadata: remoteProject.metadata,
      customInstructions: remoteProject.customInstructions ?? null,
      updatedAt: remoteProject.updatedAt,
    });
  }

  for (const conversation of state.conversations) {
    if (conversation.projectId !== projectId) continue;
    const existing = getConversation(db, conversation.id);
    if (!existing) {
      insertConversation(db, conversation);
      continue;
    }
    if (conversation.updatedAt >= existing.updatedAt) {
      updateConversation(db, conversation.id, conversation);
    }
  }

  for (const entry of state.messages) {
    if (!shouldApplyRemoteMessage(db, entry.message)) continue;
    upsertMessage(db, entry.conversationId, entry.message);
  }

  for (const session of state.agentSessions) {
    upsertAgentSession(db, {
      conversationId: session.conversationId,
      agentId: session.agentId,
      sessionId: session.sessionId,
      stablePromptHash: session.stablePromptHash,
    });
  }

  return true;
}

export async function exportTeamverProjectDaemonState(
  db: SqliteDb,
  remote: ProjectStorage,
  projectId: string,
): Promise<boolean> {
  if (isDaemonDbPostgres()) return false;
  if (!isTeamverDesignManaged()) return false;
  const state = buildTeamverProjectDaemonState(db, projectId);
  if (!state) return false;
  await writeTeamverProjectDaemonStateToRemote(remote, projectId, state);
  return true;
}

export async function importTeamverProjectDaemonState(
  db: SqliteDb,
  remote: ProjectStorage,
  projectId: string,
): Promise<boolean> {
  if (isDaemonDbPostgres()) return false;
  if (!isTeamverDesignManaged()) return false;
  const state = await readTeamverProjectDaemonStateFromRemote(remote, projectId);
  if (!state) return false;
  return applyTeamverProjectDaemonState(db, state);
}

const exportThrottleMs = 2_000;
const lastDaemonStateExportAt = new Map<string, number>();
const exportInflight = new Map<string, Promise<void>>();

export async function exportTeamverProjectDaemonStateThrottled(
  db: SqliteDb,
  remote: ProjectStorage,
  projectId: string,
): Promise<void> {
  if (isDaemonDbPostgres()) return;
  const trimmed = projectId.trim();
  if (!trimmed) return;
  const now = Date.now();
  const previous = lastDaemonStateExportAt.get(trimmed) ?? 0;
  if (now - previous < exportThrottleMs) return;

  const inflight = exportInflight.get(trimmed);
  if (inflight) {
    await inflight;
    return;
  }

  const task = (async () => {
    const exported = await exportTeamverProjectDaemonState(db, remote, trimmed);
    if (exported) lastDaemonStateExportAt.set(trimmed, Date.now());
  })();

  exportInflight.set(trimmed, task);
  try {
    await task;
  } finally {
    exportInflight.delete(trimmed);
  }
}

export async function syncTeamverProjectDaemonStateFromRequest(
  db: SqliteDb,
  hooks: ProjectStorageAccessHooks | null | undefined,
  req: Request,
  projectId: string,
  direction: 'import' | 'export' | 'both',
): Promise<void> {
  if (isDaemonDbPostgres()) return;
  if (!hooks || !isTeamverDesignManaged()) return;
  if (typeof hooks.resolveRemoteForDaemonState !== 'function') return;
  try {
    const remote = await hooks.resolveRemoteForDaemonState(req, projectId);
    if (!remote) return;
    if (direction === 'import' || direction === 'both') {
      await importTeamverProjectDaemonState(db, remote, projectId);
    }
    if (direction === 'export' || direction === 'both') {
      await exportTeamverProjectDaemonStateThrottled(db, remote, projectId);
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        metric: 'teamver_project_daemon_state_sync_failed',
        projectId,
        direction,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

export function scheduleTeamverProjectDaemonStateExport(
  db: SqliteDb,
  hooks: ProjectStorageAccessHooks | null | undefined,
  req: Request,
  res: Response,
  projectId: string,
): void {
  if (!hooks || !isTeamverDesignManaged()) return;
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    void syncTeamverProjectDaemonStateFromRequest(db, hooks, req, projectId, 'export');
  });
}

/** @internal vitest */
export function resetTeamverProjectDaemonStateExportThrottleForTests(): void {
  lastDaemonStateExportAt.clear();
  exportInflight.clear();
}
