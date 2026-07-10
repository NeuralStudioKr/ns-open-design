// SQLite-backed persistence for projects, conversations, messages, and the
// per-project set of open workspace tabs. The on-disk project folder under
// .od/projects/<id>/ is still the single owner of the user's actual files
// (HTML artifacts, sketches, uploads); this database tracks the metadata
// that used to live in localStorage.

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { ProjectBrowserWorkspaceTab, ProjectTabsState } from '@open-design/contracts';
import { migrateCritique } from './critique/persistence.js';
import { migrateMediaTasks } from './media-tasks.js';
import { migratePlugins } from './plugins/persistence.js';
import {
  deleteCachedAgentSession,
  deleteCachedProject,
  getCachedAgentSession,
  getCachedConversations,
  getCachedConversationById,
  getCachedDeployments,
  getCachedMessages,
  getCachedPreviewComments,
  getCachedProject,
  getCachedTabsState,
  invalidateCachedConversations,
  invalidateCachedMessages,
  invalidateCachedTabsState,
  isProjectDeletedFromCache,
  listCachedProjects,
  removeCachedPreviewComment,
  setCachedAgentSession,
  setCachedAgentSessionsForConversation,
  setCachedConversations,
  setCachedDeployments,
  setCachedMessages,
  setCachedPreviewComments,
  setCachedProject,
  setCachedTabsState,
  updateCachedMessage,
  upsertCachedConversation,
  upsertCachedDeployment,
  upsertCachedPreviewComment,
  findCachedMessage,
} from './storage/daemon-db-entity-cache.js';
import * as pgCore from './storage/daemon-db-postgres-core.js';
import {
  getPostgresPool,
  isDaemonDbPostgres,
  schedulePostgresWrite,
} from './storage/daemon-db-runtime.js';

type SqliteDb = Database.Database;
type DbRow = Record<string, any>;
type JsonObject = Record<string, unknown>;
type ChatSessionMode = 'design' | 'chat';

let dbInstance: SqliteDb | null = null;
let dbFile: string | null = null;

function row(value: unknown): DbRow | null {
  return value && typeof value === 'object' ? value as DbRow : null;
}

function rows(value: unknown[]): DbRow[] {
  return value.map((item) => row(item) ?? {});
}

export function openDatabase(projectRoot: string, { dataDir }: { dataDir?: string } = {}): SqliteDb {
  const dir = dataDir ? path.resolve(dataDir) : path.join(projectRoot, '.od');
  const file = path.join(dir, 'app.sqlite');
  if (dbInstance && dbFile === file) return dbInstance;
  if (dbInstance) closeDatabase();
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  dbInstance = db;
  dbFile = file;
  return db;
}

export function closeDatabase() {
  if (!dbInstance) return;
  dbInstance.close();
  dbInstance = null;
  dbFile = null;
}

function migrate(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      skill_id TEXT,
      design_system_id TEXT,
      pending_prompt TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      source_project_id TEXT,
      files_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT,
      session_mode TEXT NOT NULL DEFAULT 'design',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_conv_project
      ON conversations(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS agent_sessions (
      conversation_id TEXT NOT NULL,
      agent_id        TEXT NOT NULL,
      session_id      TEXT NOT NULL,
      stable_prompt_hash TEXT,
      updated_at      INTEGER NOT NULL,
      PRIMARY KEY (conversation_id, agent_id),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      agent_id TEXT,
      agent_name TEXT,
      events_json TEXT,
      attachments_json TEXT,
      produced_files_json TEXT,
      feedback_json TEXT,
      pre_turn_file_names_json TEXT,
      session_mode TEXT,
      run_context_json TEXT,
      applied_plugin_snapshot_json TEXT,
      telemetry_finalized_at INTEGER,
      started_at INTEGER,
      ended_at INTEGER,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv
      ON messages(conversation_id, position);

    CREATE TABLE IF NOT EXISTS preview_comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      element_id TEXT NOT NULL,
      selector TEXT NOT NULL,
      label TEXT NOT NULL,
      text TEXT NOT NULL,
      position_json TEXT NOT NULL,
      html_hint TEXT NOT NULL,
      selection_kind TEXT,
      member_count INTEGER,
      pod_members_json TEXT,
      style_json TEXT,
      attachments_json TEXT,
      slide_index INTEGER,
      slide_key INTEGER NOT NULL DEFAULT -1,
      note TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id, conversation_id, file_path, element_id, slide_key),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_preview_comments_conversation
      ON preview_comments(project_id, conversation_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_preview_comments_conversation_created
      ON preview_comments(project_id, conversation_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS tabs (
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(project_id, name),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tabs_state (
      project_id TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL,
      state_json TEXT,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tabs_project
      ON tabs(project_id, position);

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      url TEXT NOT NULL,
      deployment_id TEXT,
      deployment_count INTEGER NOT NULL DEFAULT 1,
      target TEXT NOT NULL DEFAULT 'preview',
      status TEXT NOT NULL DEFAULT 'ready',
      status_message TEXT,
      reachable_at INTEGER,
      provider_metadata_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id, file_name, provider_id),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_project
      ON deployments(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_kind TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      schedule_json TEXT,
      project_mode TEXT NOT NULL,
      project_id TEXT,
      skill_id TEXT,
      agent_id TEXT,
      context_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routine_runs (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      agent_run_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      summary TEXT,
      error TEXT,
      error_code TEXT,
      FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS routine_schedule_claims (
      routine_id TEXT NOT NULL,
      slot_at INTEGER NOT NULL,
      claimed_at INTEGER NOT NULL,
      PRIMARY KEY(routine_id, slot_at),
      FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_routine_runs_routine
      ON routine_runs(routine_id, started_at DESC);
  `);
  // Forward-compatible column add for databases created before metadata_json.
  // SQLite has no IF NOT EXISTS for ALTER, so we check pragma_table_info.
  const cols = db.prepare(`PRAGMA table_info(projects)`).all() as DbRow[];
  if (!cols.some((c: DbRow) => c.name === 'metadata_json')) {
    db.exec(`ALTER TABLE projects ADD COLUMN metadata_json TEXT`);
  }
  if (!cols.some((c: DbRow) => c.name === 'custom_instructions')) {
    db.exec(`ALTER TABLE projects ADD COLUMN custom_instructions TEXT`);
  }
  const conversationCols = db.prepare(`PRAGMA table_info(conversations)`).all() as DbRow[];
  if (!conversationCols.some((c: DbRow) => c.name === 'session_mode')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN session_mode TEXT NOT NULL DEFAULT 'design'`);
  }
  const messageCols = db.prepare(`PRAGMA table_info(messages)`).all() as DbRow[];
  if (!messageCols.some((c: DbRow) => c.name === 'agent_id')) {
    db.exec(`ALTER TABLE messages ADD COLUMN agent_id TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'agent_name')) {
    db.exec(`ALTER TABLE messages ADD COLUMN agent_name TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'run_id')) {
    db.exec(`ALTER TABLE messages ADD COLUMN run_id TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'run_status')) {
    db.exec(`ALTER TABLE messages ADD COLUMN run_status TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'last_run_event_id')) {
    db.exec(`ALTER TABLE messages ADD COLUMN last_run_event_id TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'comment_attachments_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN comment_attachments_json TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'feedback_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN feedback_json TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'pre_turn_file_names_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN pre_turn_file_names_json TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'session_mode')) {
    db.exec(`ALTER TABLE messages ADD COLUMN session_mode TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'run_context_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN run_context_json TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'applied_plugin_snapshot_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN applied_plugin_snapshot_json TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'telemetry_finalized_at')) {
    db.exec(`ALTER TABLE messages ADD COLUMN telemetry_finalized_at INTEGER`);
  }
  const routineRunCols = db.prepare(`PRAGMA table_info(routine_runs)`).all() as DbRow[];
  if (!routineRunCols.some((c: DbRow) => c.name === 'error_code')) {
    db.exec(`ALTER TABLE routine_runs ADD COLUMN error_code TEXT`);
  }

  const previewCommentCols = db.prepare(`PRAGMA table_info(preview_comments)`).all() as DbRow[];
  if (!previewCommentCols.some((c: DbRow) => c.name === 'selection_kind')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN selection_kind TEXT`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'member_count')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN member_count INTEGER`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'pod_members_json')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN pod_members_json TEXT`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'style_json')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN style_json TEXT`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'attachments_json')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN attachments_json TEXT`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'slide_index')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN slide_index INTEGER`);
  }
  migratePreviewCommentsSlideKey(db);
  const deploymentCols = db.prepare(`PRAGMA table_info(deployments)`).all() as DbRow[];
  if (!deploymentCols.some((c: DbRow) => c.name === 'status')) {
    db.exec(`ALTER TABLE deployments ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'`);
  }
  if (!deploymentCols.some((c: DbRow) => c.name === 'status_message')) {
    db.exec(`ALTER TABLE deployments ADD COLUMN status_message TEXT`);
  }
  if (!deploymentCols.some((c: DbRow) => c.name === 'reachable_at')) {
    db.exec(`ALTER TABLE deployments ADD COLUMN reachable_at INTEGER`);
  }
  if (!deploymentCols.some((c: DbRow) => c.name === 'provider_metadata_json')) {
    db.exec(`ALTER TABLE deployments ADD COLUMN provider_metadata_json TEXT`);
  }
  // schedule_json holds the full RoutineSchedule object (kind discriminator
  // plus kind-specific fields like time/timezone/weekday). The legacy
  // schedule_kind/schedule_value columns are kept populated for query
  // convenience and as a fallback when reading rows written before this
  // column existed.
  const routineCols = db.prepare(`PRAGMA table_info(routines)`).all() as DbRow[];
  if (routineCols.length > 0 && !routineCols.some((c: DbRow) => c.name === 'schedule_json')) {
    db.exec(`ALTER TABLE routines ADD COLUMN schedule_json TEXT`);
  }
  if (routineCols.length > 0 && !routineCols.some((c: DbRow) => c.name === 'context_json')) {
    db.exec(`ALTER TABLE routines ADD COLUMN context_json TEXT`);
  }
  const agentSessionCols = db.prepare(`PRAGMA table_info(agent_sessions)`).all() as DbRow[];
  if (agentSessionCols.length > 0 && !agentSessionCols.some((c: DbRow) => c.name === 'stable_prompt_hash')) {
    db.exec(`ALTER TABLE agent_sessions ADD COLUMN stable_prompt_hash TEXT`);
  }
  const tabsStateCols = db.prepare(`PRAGMA table_info(tabs_state)`).all() as DbRow[];
  if (tabsStateCols.length > 0 && !tabsStateCols.some((c: DbRow) => c.name === 'state_json')) {
    db.exec(`ALTER TABLE tabs_state ADD COLUMN state_json TEXT`);
  }
  migrateCritique(db);
  migrateMediaTasks(db);
  migratePlugins(db);
}

function migratePreviewCommentsSlideKey(db: SqliteDb): void {
  const table = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'preview_comments'`)
    .get() as DbRow | undefined;
  const tableSql = String(table?.sql ?? '');
  const hasSlideKey = /\bslide_key\b/i.test(tableSql);
  const hasLegacyUnique = /UNIQUE\s*\(\s*project_id\s*,\s*conversation_id\s*,\s*file_path\s*,\s*element_id\s*\)/i
    .test(tableSql);
  if (hasSlideKey && !hasLegacyUnique) return;

  db.exec(`
    CREATE TABLE preview_comments_next (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      element_id TEXT NOT NULL,
      selector TEXT NOT NULL,
      label TEXT NOT NULL,
      text TEXT NOT NULL,
      position_json TEXT NOT NULL,
      html_hint TEXT NOT NULL,
      selection_kind TEXT,
      member_count INTEGER,
      pod_members_json TEXT,
      style_json TEXT,
      attachments_json TEXT,
      slide_index INTEGER,
      slide_key INTEGER NOT NULL DEFAULT -1,
      note TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id, conversation_id, file_path, element_id, slide_key),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    INSERT INTO preview_comments_next
      (id, project_id, conversation_id, file_path, element_id, selector, label,
       text, position_json, html_hint, selection_kind, member_count, pod_members_json,
       style_json, attachments_json, slide_index, slide_key, note, status, created_at, updated_at)
    SELECT id, project_id, conversation_id, file_path, element_id, selector, label,
       text, position_json, html_hint, selection_kind, member_count, pod_members_json,
       style_json, attachments_json, slide_index, COALESCE(slide_index, -1), note, status, created_at, updated_at
      FROM preview_comments;

    DROP TABLE preview_comments;
    ALTER TABLE preview_comments_next RENAME TO preview_comments;
    CREATE INDEX IF NOT EXISTS idx_preview_comments_conversation
      ON preview_comments(project_id, conversation_id, updated_at DESC);
  `);
}

// ---------- deployments ----------

const DEPLOYMENT_COLS = `id, project_id AS projectId, file_name AS fileName,
  provider_id AS providerId, url, deployment_id AS deploymentId,
  deployment_count AS deploymentCount, target, status,
  status_message AS statusMessage, reachable_at AS reachableAt,
  provider_metadata_json AS providerMetadataJson,
  created_at AS createdAt, updated_at AS updatedAt`;

export function listDeployments(db: SqliteDb, projectId: string) {
  if (isDaemonDbPostgres()) {
    const cached = getCachedDeployments(projectId);
    return (cached ?? []).map((row) => normalizeDeployment(row as DbRow));
  }
  return (db
    .prepare(
      `SELECT ${DEPLOYMENT_COLS}
         FROM deployments
        WHERE project_id = ?
        ORDER BY updated_at DESC`,
    )
    .all(projectId) as DbRow[])
    .map(normalizeDeployment);
}

export function getDeployment(db: SqliteDb, projectId: string, fileName: string, providerId: string) {
  if (isDaemonDbPostgres()) {
    const cached = getCachedDeployments(projectId) ?? [];
    const hit = cached.find(
      (row) =>
        String((row as DbRow).fileName) === fileName &&
        String((row as DbRow).providerId) === providerId,
    );
    return hit ? normalizeDeployment(hit as DbRow) : null;
  }
  const row = db
    .prepare(
      `SELECT ${DEPLOYMENT_COLS}
         FROM deployments
        WHERE project_id = ? AND file_name = ? AND provider_id = ?`,
    )
    .get(projectId, fileName, providerId) as DbRow | undefined;
  return row ? normalizeDeployment(row) : null;
}

export function getDeploymentById(db: SqliteDb, projectId: string, id: string) {
  if (isDaemonDbPostgres()) {
    const cached = getCachedDeployments(projectId) ?? [];
    const hit = cached.find((row) => String((row as DbRow).id) === id);
    return hit ? normalizeDeployment(hit as DbRow) : null;
  }
  const row = db
    .prepare(
      `SELECT ${DEPLOYMENT_COLS}
         FROM deployments
        WHERE project_id = ? AND id = ?`,
    )
    .get(projectId, id) as DbRow | undefined;
  return row ? normalizeDeployment(row) : null;
}

export function upsertDeployment(db: SqliteDb, deployment: DbRow) {
  const existing = getDeployment(
    db,
    deployment.projectId,
    deployment.fileName,
    deployment.providerId,
  );
  const now = Date.now();
  const inputProviderMetadata =
    deployment.providerMetadata === undefined
      ? existing?.providerMetadata
      : deployment.providerMetadata;
  const providerMetadata =
    deployment.cloudflarePages && typeof deployment.cloudflarePages === 'object'
      ? {
          ...(inputProviderMetadata && typeof inputProviderMetadata === 'object' && !Array.isArray(inputProviderMetadata)
            ? inputProviderMetadata
            : {}),
          cloudflarePages: deployment.cloudflarePages,
        }
      : inputProviderMetadata;
  const next = {
    id: existing?.id ?? deployment.id,
    projectId: deployment.projectId,
    fileName: deployment.fileName,
    providerId: deployment.providerId,
    url: deployment.url,
    deploymentId: deployment.deploymentId ?? null,
    deploymentCount:
      typeof deployment.deploymentCount === 'number'
        ? deployment.deploymentCount
        : (existing?.deploymentCount ?? 0) + 1,
    target: deployment.target ?? 'preview',
    status: deployment.status ?? existing?.status ?? 'ready',
    statusMessage: deployment.statusMessage ?? null,
    reachableAt: deployment.reachableAt ?? null,
    providerMetadata,
    createdAt: existing?.createdAt ?? deployment.createdAt ?? now,
    updatedAt: deployment.updatedAt ?? now,
  };
  const providerMetadataJson = stringifyJsonObjectOrNull(next.providerMetadata);

  if (isDaemonDbPostgres()) {
    // Ensure the project bucket exists so upsertCachedDeployment isn't a
    // no-op after a warm miss.
    if (getCachedDeployments(next.projectId) == null) {
      setCachedDeployments(next.projectId, []);
    }
    const rowForCache: DbRow = {
      id: next.id,
      projectId: next.projectId,
      fileName: next.fileName,
      providerId: next.providerId,
      url: next.url,
      deploymentId: next.deploymentId,
      deploymentCount: next.deploymentCount,
      target: next.target,
      status: next.status,
      statusMessage: next.statusMessage,
      reachableAt: next.reachableAt,
      providerMetadataJson,
      createdAt: next.createdAt,
      updatedAt: next.updatedAt,
    };
    upsertCachedDeployment(next.projectId, rowForCache);
    schedulePostgresWrite(async () => {
      await pgCore.pgUpsertDeployment(getPostgresPool(), {
        id: next.id,
        projectId: next.projectId,
        fileName: next.fileName,
        providerId: next.providerId,
        url: next.url,
        deploymentId: next.deploymentId,
        deploymentCount: next.deploymentCount,
        target: next.target,
        status: next.status,
        statusMessage: next.statusMessage,
        reachableAt: next.reachableAt,
        providerMetadataJson,
        createdAt: next.createdAt,
        updatedAt: next.updatedAt,
      });
    });
    return normalizeDeployment(rowForCache);
  }

  db.prepare(
    `INSERT INTO deployments
       (id, project_id, file_name, provider_id, url, deployment_id,
        deployment_count, target, status, status_message, reachable_at,
        provider_metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, file_name, provider_id) DO UPDATE SET
       url = excluded.url,
       deployment_id = excluded.deployment_id,
       deployment_count = excluded.deployment_count,
       target = excluded.target,
       status = excluded.status,
       status_message = excluded.status_message,
       reachable_at = excluded.reachable_at,
       provider_metadata_json = excluded.provider_metadata_json,
       updated_at = excluded.updated_at`,
  ).run(
    next.id,
    next.projectId,
    next.fileName,
    next.providerId,
    next.url,
    next.deploymentId,
    next.deploymentCount,
    next.target,
    next.status,
    next.statusMessage,
    next.reachableAt,
    providerMetadataJson,
    next.createdAt,
    next.updatedAt,
  );
  return getDeployment(db, next.projectId, next.fileName, next.providerId);
}

function normalizeDeployment(row: DbRow) {
  const providerMetadata = parseJsonOrUndef(row.providerMetadataJson);
  const normalizedProviderMetadata =
    providerMetadata && typeof providerMetadata === 'object' && !Array.isArray(providerMetadata)
      ? providerMetadata
      : undefined;
  return {
    id: row.id,
    projectId: row.projectId,
    fileName: row.fileName,
    providerId: row.providerId,
    url: row.url,
    deploymentId: row.deploymentId ?? undefined,
    deploymentCount: Number(row.deploymentCount ?? 1),
    target: 'preview',
    status: row.status || 'ready',
    statusMessage: row.statusMessage ?? undefined,
    reachableAt: row.reachableAt == null ? undefined : Number(row.reachableAt),
    cloudflarePages:
      normalizedProviderMetadata?.cloudflarePages &&
      typeof normalizedProviderMetadata.cloudflarePages === 'object' &&
      !Array.isArray(normalizedProviderMetadata.cloudflarePages)
        ? normalizedProviderMetadata.cloudflarePages
        : undefined,
    providerMetadata: normalizedProviderMetadata,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

function stringifyJsonObjectOrNull(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.keys(value).length > 0 ? JSON.stringify(value) : null;
}

// ---------- projects ----------

const PROJECT_COLS = `id, name, skill_id AS skillId,
  design_system_id AS designSystemId,
  pending_prompt AS pendingPrompt,
  metadata_json AS metadataJson,
  applied_plugin_snapshot_id AS appliedPluginSnapshotId,
  custom_instructions AS customInstructions,
  created_at AS createdAt,
  updated_at AS updatedAt`;

/** Plugin/critique tables still FK to sqlite — mirror PG writes for cross-node parity. */
function mirrorProjectRowToSqlite(db: SqliteDb, p: DbRow): void {
  db.prepare(
    `INSERT INTO projects
       (id, name, skill_id, design_system_id, pending_prompt,
        metadata_json, custom_instructions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        skill_id = excluded.skill_id,
        design_system_id = excluded.design_system_id,
        pending_prompt = excluded.pending_prompt,
        metadata_json = excluded.metadata_json,
        custom_instructions = excluded.custom_instructions,
        updated_at = excluded.updated_at`,
  ).run(
    p.id,
    p.name,
    p.skillId ?? null,
    p.designSystemId ?? null,
    p.pendingPrompt ?? null,
    p.metadata ? JSON.stringify(p.metadata) : null,
    p.customInstructions ?? null,
    p.createdAt,
    p.updatedAt,
  );
}

function mirrorConversationRowToSqlite(db: SqliteDb, c: DbRow): void {
  db.prepare(
    `INSERT INTO conversations
       (id, project_id, title, session_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        title = excluded.title,
        session_mode = excluded.session_mode,
        updated_at = excluded.updated_at`,
  ).run(
    c.id,
    c.projectId,
    c.title ?? null,
    normalizeConversationSessionMode(c.sessionMode),
    c.createdAt,
    c.updatedAt,
  );
}

function deleteProjectRowFromSqlite(db: SqliteDb, id: string): void {
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
}

function projectRowForSqliteMirror(
  row: DbRow & {
    id: string;
    name: string;
    skillId?: string | null;
    designSystemId?: string | null;
    pendingPrompt?: string | null;
    metadata?: unknown;
    customInstructions?: string | null;
    createdAt: number;
    updatedAt: number;
  },
): DbRow {
  return {
    id: row.id,
    name: row.name,
    skillId: row.skillId ?? null,
    designSystemId: row.designSystemId ?? null,
    pendingPrompt: row.pendingPrompt ?? null,
    metadata: row.metadata,
    customInstructions: row.customInstructions ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listProjects(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT ${PROJECT_COLS}
         FROM projects
        ORDER BY updated_at DESC`,
    )
    .all() as DbRow[];
  return rows.map(normalizeProject);
}

export type ProjectListCursor = {
  updatedAt: number;
  id: string;
};

export function encodeProjectListCursor(cursor: ProjectListCursor): string {
  return `${cursor.updatedAt}:${encodeURIComponent(cursor.id)}`;
}

export function parseProjectListCursor(raw: unknown): ProjectListCursor | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const colon = trimmed.indexOf(':');
  if (colon <= 0) return null;
  const updatedAt = Number(trimmed.slice(0, colon));
  const id = decodeURIComponent(trimmed.slice(colon + 1));
  if (!Number.isFinite(updatedAt) || !id) return null;
  return { updatedAt, id };
}

export function listProjectsPage(
  db: SqliteDb,
  options: { limit: number; cursor?: ProjectListCursor | null },
): { projects: ReturnType<typeof normalizeProject>[]; hasMore: boolean; nextCursor: string | null } {
  const limit = Math.max(1, Math.min(Math.floor(options.limit), 100));
  const cursor = options.cursor ?? null;
  const params: unknown[] = [];
  let where = '';
  if (cursor) {
    where = 'WHERE (updated_at < ? OR (updated_at = ? AND id < ?))';
    params.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
  }
  params.push(limit + 1);
  const rows = db
    .prepare(
      `SELECT ${PROJECT_COLS}
         FROM projects
         ${where}
        ORDER BY updated_at DESC, id DESC
        LIMIT ?`,
    )
    .all(...params) as DbRow[];
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const projects = slice.map(normalizeProject);
  const last = projects.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeProjectListCursor({ updatedAt: last.updatedAt, id: last.id })
      : null;
  return { projects, hasMore, nextCursor };
}

type NormalizedProject = ReturnType<typeof normalizeProject>;

function compareProjectsDesc(a: NormalizedProject, b: NormalizedProject): number {
  if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
  if (a.id < b.id) return 1;
  if (a.id > b.id) return -1;
  return 0;
}

function projectBeforeCursor(project: NormalizedProject, cursor: ProjectListCursor): boolean {
  return (
    project.updatedAt < cursor.updatedAt
    || (project.updatedAt === cursor.updatedAt && project.id < cursor.id)
  );
}

function cachedProjectAsNormalized(cached: DbRow): NormalizedProject {
  if (cached.metadataJson !== undefined && cached.metadataJson !== null) {
    return normalizeProject(cached);
  }
  return cached as NormalizedProject;
}

async function listMergedProjectsPostgres(): Promise<NormalizedProject[]> {
  const rows = await pgCore.pgListProjects(getPostgresPool());
  const byId = new Map<string, NormalizedProject>();
  for (const row of rows) {
    const id = String(row.id);
    if (isProjectDeletedFromCache(id)) continue;
    byId.set(id, normalizeProject(row));
  }
  for (const cached of listCachedProjects()) {
    const id = String(cached.id);
    if (isProjectDeletedFromCache(id)) continue;
    const project = cachedProjectAsNormalized(cached);
    const existing = byId.get(id);
    if (!existing || project.updatedAt > existing.updatedAt) {
      byId.set(id, project);
    }
  }
  const merged = Array.from(byId.values()).sort(compareProjectsDesc);
  for (const project of merged) {
    setCachedProject(project);
  }
  return merged;
}

function paginateMergedProjects(
  projects: NormalizedProject[],
  options: { limit: number; cursor?: ProjectListCursor | null },
): { projects: NormalizedProject[]; hasMore: boolean; nextCursor: string | null } {
  const limit = Math.max(1, Math.min(Math.floor(options.limit), 100));
  const cursor = options.cursor ?? null;
  const filtered = cursor ? projects.filter((project) => projectBeforeCursor(project, cursor)) : projects;
  const hasMore = filtered.length > limit;
  const slice = hasMore ? filtered.slice(0, limit) : filtered;
  const last = slice.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeProjectListCursor({ updatedAt: last.updatedAt, id: last.id })
      : null;
  return { projects: slice, hasMore, nextCursor };
}

export async function listProjectsAsync(db: SqliteDb) {
  if (!isDaemonDbPostgres()) return listProjects(db);
  return listMergedProjectsPostgres();
}

export async function listProjectsPageAsync(
  db: SqliteDb,
  options: { limit: number; cursor?: ProjectListCursor | null },
): Promise<{
  projects: NormalizedProject[];
  hasMore: boolean;
  nextCursor: string | null;
}> {
  if (!isDaemonDbPostgres()) return listProjectsPage(db, options);
  const merged = await listMergedProjectsPostgres();
  return paginateMergedProjects(merged, options);
}

type ProjectRunStatusEntry = {
  value: ReturnType<typeof normalizeProjectRunStatus>;
  updatedAt: number;
  runId?: string;
};

function buildLatestProjectRunStatusMap(rows: DbRow[]): Map<string, ProjectRunStatusEntry> {
  const latestByProject = new Map<string, ProjectRunStatusEntry>();
  for (const row of rows) {
    const projectId = String(row.projectId ?? '');
    if (!projectId || latestByProject.has(projectId)) continue;
    const entry: ProjectRunStatusEntry = {
      value: normalizeProjectRunStatus(row.status),
      updatedAt: Number(row.updatedAt),
    };
    if (row.runId != null) entry.runId = String(row.runId);
    latestByProject.set(projectId, entry);
  }
  return latestByProject;
}

export function listLatestProjectRunStatuses(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT c.project_id AS projectId,
              m.run_id AS runId,
              m.run_status AS status,
              COALESCE(m.ended_at, m.started_at, m.created_at) AS updatedAt
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE m.run_status IS NOT NULL
        ORDER BY updatedAt DESC`,
    )
    .all() as DbRow[];
  return buildLatestProjectRunStatusMap(rows);
}

export async function listLatestProjectRunStatusesAsync(db: SqliteDb) {
  if (!isDaemonDbPostgres()) return listLatestProjectRunStatuses(db);
  const rows = await pgCore.pgListLatestProjectRunStatuses(getPostgresPool());
  return buildLatestProjectRunStatusMap(rows);
}

export function listProjectsAwaitingInput(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT latest.projectId
         FROM (
           SELECT c.project_id AS projectId,
                  m.conversation_id AS conversationId,
                  m.created_at AS createdAt,
                  m.position AS position,
                  ROW_NUMBER() OVER (
                    PARTITION BY c.project_id
                    ORDER BY m.created_at DESC, m.position DESC
                  ) AS rowNum
             FROM messages m
             JOIN conversations c ON c.id = m.conversation_id
            WHERE m.role = 'assistant'
              -- ask-question is an accepted alias for question-form (UI parser
              -- + daemon open-tag matcher), so an alias-form turn must also
              -- count as awaiting input.
              AND (
                LOWER(m.content) LIKE '%<question-form%'
                OR LOWER(m.content) LIKE '%<ask-question%'
              )
         ) latest
        WHERE latest.rowNum = 1
          AND NOT EXISTS (
            SELECT 1
              FROM messages reply
             WHERE reply.conversation_id = latest.conversationId
               AND reply.role = 'user'
               AND (
                 reply.created_at > latest.createdAt
                 OR (reply.created_at = latest.createdAt AND reply.position > latest.position)
               )
          )`,
    )
    .all() as DbRow[];
  return new Set((rows as DbRow[]).map((row: DbRow) => String(row.projectId)));
}

export async function listProjectsAwaitingInputAsync(db: SqliteDb) {
  if (!isDaemonDbPostgres()) return listProjectsAwaitingInput(db);
  const rows = await pgCore.pgListProjectsAwaitingInput(getPostgresPool());
  return new Set(rows.map((row) => String(row.projectId)));
}

export function getProject(db: SqliteDb, id: string) {
  if (isDaemonDbPostgres()) {
    const cached = getCachedProject(id);
    return cached ? normalizeProject(cached) : null;
  }
  const row = db
    .prepare(`SELECT ${PROJECT_COLS} FROM projects WHERE id = ?`)
    .get(id) as DbRow | undefined;
  return row ? normalizeProject(row) : null;
}

/** Postgres: cache miss falls back to RDS so cold-node GET /api/projects/:id works. */
export async function getProjectAsync(db: SqliteDb, id: string) {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const cached = getProject(db, trimmed);
  if (cached) return cached;
  if (!isDaemonDbPostgres()) return null;
  const pool = getPostgresPool();
  const projectRow = await pgCore.pgGetProject(pool, trimmed);
  if (!projectRow) return null;
  const normalized = normalizeProject(projectRow);
  setCachedProject(normalized);
  mirrorProjectRowToSqlite(db, {
    id: normalized.id,
    name: normalized.name,
    skillId: normalized.skillId,
    designSystemId: normalized.designSystemId,
    pendingPrompt: normalized.pendingPrompt ?? null,
    metadata: normalized.metadata,
    customInstructions: normalized.customInstructions ?? null,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  });
  return normalized;
}

export function insertProject(db: SqliteDb, p: DbRow) {
  if (isDaemonDbPostgres()) {
    const created = normalizeProject({
      id: p.id,
      name: p.name,
      skillId: p.skillId ?? null,
      designSystemId: p.designSystemId ?? null,
      pendingPrompt: p.pendingPrompt ?? null,
      metadataJson: p.metadata ? JSON.stringify(p.metadata) : null,
      appliedPluginSnapshotId: p.appliedPluginSnapshotId ?? null,
      customInstructions: p.customInstructions ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
    setCachedProject(created);
    mirrorProjectRowToSqlite(db, p);
    schedulePostgresWrite(async () => {
      await pgCore.pgInsertProject(getPostgresPool(), p);
    });
    return created;
  }
  db.prepare(
    `INSERT INTO projects
       (id, name, skill_id, design_system_id, pending_prompt,
        metadata_json, custom_instructions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    p.id,
    p.name,
    p.skillId ?? null,
    p.designSystemId ?? null,
    p.pendingPrompt ?? null,
    p.metadata ? JSON.stringify(p.metadata) : null,
    p.customInstructions ?? null,
    p.createdAt,
    p.updatedAt,
  );
  return getProject(db, p.id);
}

/** Postgres: await durable insert before HTTP create returns (cross-node list parity). */
export async function insertProjectAsync(db: SqliteDb, p: DbRow) {
  if (!isDaemonDbPostgres()) {
    return insertProject(db, p);
  }
  const created = normalizeProject({
    id: p.id,
    name: p.name,
    skillId: p.skillId ?? null,
    designSystemId: p.designSystemId ?? null,
    pendingPrompt: p.pendingPrompt ?? null,
    metadataJson: p.metadata ? JSON.stringify(p.metadata) : null,
    appliedPluginSnapshotId: p.appliedPluginSnapshotId ?? null,
    customInstructions: p.customInstructions ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  });
  setCachedProject(created);
  mirrorProjectRowToSqlite(db, p);
  await pgCore.pgInsertProject(getPostgresPool(), p);
  return created;
}

export function updateProject(db: SqliteDb, id: string, patch: DbRow) {
  if (isDaemonDbPostgres()) {
    const existing = getProject(db, id);
    if (!existing) return null;
    const merged = {
      ...existing,
      ...patch,
      updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now(),
    };
    setCachedProject(merged);
    mirrorProjectRowToSqlite(db, projectRowForSqliteMirror(merged));
    schedulePostgresWrite(async () => {
      await pgCore.pgUpdateProject(getPostgresPool(), id, merged);
    });
    return merged;
  }
  const existing = getProject(db, id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...patch,
    updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now(),
  };
  db.prepare(
    `UPDATE projects
        SET name = ?,
            skill_id = ?,
            design_system_id = ?,
            pending_prompt = ?,
            metadata_json = ?,
            custom_instructions = ?,
            updated_at = ?
      WHERE id = ?`,
  ).run(
    merged.name,
    merged.skillId ?? null,
    merged.designSystemId ?? null,
    merged.pendingPrompt ?? null,
    merged.metadata ? JSON.stringify(merged.metadata) : null,
    merged.customInstructions ?? null,
    merged.updatedAt,
    id,
  );
  return getProject(db, id);
}

export function deleteProject(db: SqliteDb, id: string) {
  if (isDaemonDbPostgres()) {
    deleteCachedProject(id);
    deleteProjectRowFromSqlite(db, id);
    schedulePostgresWrite(async () => {
      await pgCore.pgDeleteProject(getPostgresPool(), id);
    });
    return;
  }
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
}

/** Postgres: await durable delete (HTTP DELETE must not return before PG row is gone). */
export async function deleteProjectAsync(db: SqliteDb, id: string): Promise<void> {
  if (!isDaemonDbPostgres()) {
    deleteProject(db, id);
    return;
  }
  deleteCachedProject(id);
  await pgCore.pgDeleteProject(getPostgresPool(), id);
  deleteProjectRowFromSqlite(db, id);
}

function normalizeProject(row: DbRow) {
  let metadata;
  if (row.metadataJson) {
    try {
      metadata = JSON.parse(row.metadataJson);
    } catch {
      metadata = undefined;
    }
  }
  return {
    id: row.id,
    name: row.name,
    skillId: row.skillId,
    designSystemId: row.designSystemId,
    pendingPrompt: row.pendingPrompt ?? undefined,
    metadata,
    appliedPluginSnapshotId: row.appliedPluginSnapshotId ?? undefined,
    customInstructions: row.customInstructions ?? undefined,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

function normalizeProjectRunStatus(status: unknown) {
  if (status === 'starting') return 'running';
  if (status === 'cancelled') return 'canceled';
  if (
    status === 'queued' ||
    status === 'running' ||
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'canceled'
  ) {
    return status;
  }
  return 'not_started';
}

// ---------- templates ----------

export function listTemplates(db: SqliteDb) {
  return (db
    .prepare(
      `SELECT id, name, description, source_project_id AS sourceProjectId,
              files_json AS filesJson, created_at AS createdAt
         FROM templates
        ORDER BY created_at DESC`,
    )
    .all() as DbRow[])
    .map(normalizeTemplate);
}

export function getTemplate(db: SqliteDb, id: string) {
  const row = db
    .prepare(
      `SELECT id, name, description, source_project_id AS sourceProjectId,
              files_json AS filesJson, created_at AS createdAt
         FROM templates WHERE id = ?`,
    )
    .get(id) as DbRow | undefined;
  return row ? normalizeTemplate(row) : null;
}

export function findTemplateByNameAndProject(
  db: SqliteDb,
  name: string,
  sourceProjectId: string,
) {
  const row = db
    .prepare(
      `SELECT id, name, description, source_project_id AS sourceProjectId,
              files_json AS filesJson, created_at AS createdAt
         FROM templates
        WHERE name = ? AND source_project_id = ?`,
    )
    .get(name, sourceProjectId) as DbRow | undefined;
  return row ? normalizeTemplate(row) : null;
}

export function insertTemplate(db: SqliteDb, t: DbRow) {
  db.prepare(
    `INSERT INTO templates (id, name, description, source_project_id, files_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    t.id,
    t.name,
    t.description ?? null,
    t.sourceProjectId ?? null,
    JSON.stringify(t.files ?? []),
    t.createdAt,
  );
  return getTemplate(db, t.id);
}

export function updateTemplate(
  db: SqliteDb,
  id: string,
  t: { description: string | null; files: unknown[] },
) {
  db.prepare(
    `UPDATE templates SET description = ?, files_json = ? WHERE id = ?`,
  ).run(t.description, JSON.stringify(t.files), id);
  return getTemplate(db, id);
}

export function deleteTemplate(db: SqliteDb, id: string) {
  db.prepare(`DELETE FROM templates WHERE id = ?`).run(id);
}

function normalizeTemplate(row: DbRow) {
  let files = [];
  try {
    files = JSON.parse(row.filesJson || '[]');
  } catch {
    files = [];
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    sourceProjectId: row.sourceProjectId ?? undefined,
    files,
    createdAt: Number(row.createdAt),
  };
}

// ---------- conversations ----------

export function listConversations(db: SqliteDb, projectId: string) {
  if (isDaemonDbPostgres()) {
    const cached = getCachedConversations(projectId);
    return cached ? cached.map((row) => normalizeConversation(row)) : [];
  }
  return rows(db
    .prepare(
      `WITH project_conversations AS (
          SELECT id, project_id AS projectId, title, session_mode AS sessionMode,
                 created_at AS createdAt, updated_at AS updatedAt
            FROM conversations
           WHERE project_id = ?
        ),
        latest_runs AS (
          SELECT conversation_id AS conversationId,
                 run_status AS latestRunStatus,
                 started_at AS latestRunStartedAt,
                 ended_at AS latestRunEndedAt,
                 events_json AS latestRunEventsJson
            FROM (
              SELECT m.conversation_id,
                     m.run_status,
                     m.started_at,
                     m.ended_at,
                     m.events_json,
                     ROW_NUMBER() OVER (
                       PARTITION BY m.conversation_id
                       ORDER BY m.position DESC
                     ) AS rn
                FROM messages m
                JOIN project_conversations c ON c.id = m.conversation_id
               WHERE m.role = 'assistant'
                 AND m.run_status IS NOT NULL
            )
           WHERE rn = 1
        ),
        message_counts AS (
          SELECT m.conversation_id AS conversationId,
                 COUNT(*) AS messageCount
            FROM messages m
            JOIN project_conversations c ON c.id = m.conversation_id
           GROUP BY m.conversation_id
        ),
        total_run_durations AS (
          SELECT m.conversation_id AS conversationId,
                 SUM(${terminalRunDurationSql('m')}) AS totalDurationMs
            FROM messages m
            JOIN project_conversations c ON c.id = m.conversation_id
           WHERE m.role = 'assistant'
             AND m.run_status IN ('succeeded', 'failed', 'canceled')
           GROUP BY m.conversation_id
        )
        SELECT c.id, c.projectId, c.title, c.sessionMode, c.createdAt, c.updatedAt,
               COALESCE(mc.messageCount, 0) AS messageCount,
               lr.latestRunStatus, lr.latestRunStartedAt,
               lr.latestRunEndedAt, lr.latestRunEventsJson,
               trd.totalDurationMs
          FROM project_conversations c
          LEFT JOIN latest_runs lr ON lr.conversationId = c.id
          LEFT JOIN message_counts mc ON mc.conversationId = c.id
          LEFT JOIN total_run_durations trd ON trd.conversationId = c.id
         ORDER BY c.updatedAt DESC`,
    )
    .all(projectId)).map(normalizeConversation);
}

export async function listConversationsAsync(db: SqliteDb, projectId: string) {
  if (!isDaemonDbPostgres()) return listConversations(db, projectId);
  const rows = await pgCore.pgListConversations(getPostgresPool(), projectId);
  const normalized = rows.map((row) => normalizeConversation(row));
  setCachedConversations(projectId, normalized);
  return normalized;
}

export async function warmProjectFromPostgres(db: SqliteDb, projectId: string): Promise<void> {
  if (!isDaemonDbPostgres()) return;
  const pool = getPostgresPool();
  const projectRow = await pgCore.pgGetProject(pool, projectId);
  if (projectRow) {
    const normalized = normalizeProject(projectRow);
    setCachedProject(normalized);
    mirrorProjectRowToSqlite(db, {
      id: normalized.id,
      name: normalized.name,
      skillId: normalized.skillId,
      designSystemId: normalized.designSystemId,
      pendingPrompt: normalized.pendingPrompt ?? null,
      metadata: normalized.metadata,
      customInstructions: normalized.customInstructions ?? null,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
    });
  }
  const conversations = await pgCore.pgListConversations(pool, projectId);
  const normalizedConversations = conversations.map((row) => normalizeConversation(row));
  setCachedConversations(projectId, normalizedConversations);
  for (const conversation of normalizedConversations) {
    mirrorConversationRowToSqlite(db, {
      id: conversation.id,
      projectId: conversation.projectId,
      title: conversation.title ?? null,
      sessionMode: conversation.sessionMode,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    });
    const messages = await pgCore.pgListMessages(pool, conversation.id);
    setCachedMessages(conversation.id, messages.map((row) => normalizeMessage(row)));
    const sessions = await pgCore.pgListAgentSessionsByConversation(pool, conversation.id);
    setCachedAgentSessionsForConversation(conversation.id, sessions);
  }
  const tabsState = await pgCore.pgGetTabsState(pool, projectId);
  if (tabsState) {
    setCachedTabsState(projectId, {
      stateJson: tabsState.stateJson,
      updatedAt: tabsState.updatedAt,
    });
  }
  // Preview comments are stored in the cache as raw postgres row shapes
  // (camelCase alias columns), matching what upsertPreviewComment writes.
  // listPreviewComments applies normalizePreviewComment on read.
  const previewComments = await pgCore.pgListPreviewCommentsForProject(pool, projectId);
  const commentsByConversation = new Map<string, DbRow[]>();
  for (const row of previewComments) {
    const conversationId = String(row.conversationId ?? '');
    if (!conversationId) continue;
    const list = commentsByConversation.get(conversationId) ?? [];
    list.push(row as DbRow);
    commentsByConversation.set(conversationId, list);
  }
  for (const conversation of normalizedConversations) {
    setCachedPreviewComments(
      projectId,
      String(conversation.id),
      commentsByConversation.get(String(conversation.id)) ?? [],
    );
  }
  const deployments = await pgCore.pgListDeployments(pool, projectId);
  setCachedDeployments(projectId, deployments as DbRow[]);
}

export function getConversation(db: SqliteDb, id: string) {
  if (isDaemonDbPostgres()) {
    const cached = getCachedConversationById(id);
    if (!cached) return null;
    return normalizeConversation(cached);
  }
  const r = db
    .prepare(
      `SELECT id, project_id AS projectId, title, session_mode AS sessionMode,
              created_at AS createdAt, updated_at AS updatedAt,
              (SELECT COUNT(*) FROM messages WHERE conversation_id = conversations.id) AS messageCount
         FROM conversations WHERE id = ?`,
    )
    .get(id) as DbRow | undefined;
  if (!r) return null;
  return {
    ...normalizeConversation(r),
    latestRun: latestConversationRunSummary(db, r.id) ?? undefined,
    ...numberProperty('totalDurationMs', totalConversationRunDurationMs(db, r.id)),
  };
}

function normalizeConversation(r: DbRow) {
  const latestRun = conversationRunSummaryFromRow({
    runStatus: r.latestRunStatus,
    startedAt: r.latestRunStartedAt,
    endedAt: r.latestRunEndedAt,
    eventsJson: r.latestRunEventsJson,
  });
  return {
    id: r.id,
    projectId: r.projectId,
    title: r.title ?? null,
    sessionMode: normalizeConversationSessionMode(r.sessionMode),
    messageCount: Number(r.messageCount ?? 0),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
    ...numberProperty('totalDurationMs', r.totalDurationMs),
    latestRun: latestRun ?? undefined,
  };
}

export function normalizeConversationSessionMode(value: unknown): ChatSessionMode {
  return value === 'chat' ? 'chat' : 'design';
}

function numberProperty(key: string, value: unknown) {
  const n = value == null ? undefined : Number(value);
  return typeof n === 'number' && Number.isFinite(n) ? { [key]: n } : {};
}

function latestConversationRunSummary(db: SqliteDb, conversationId: string) {
  const row = db
    .prepare(
      `SELECT run_status AS runStatus,
              started_at AS startedAt,
              ended_at AS endedAt,
              events_json AS eventsJson
         FROM messages
        WHERE conversation_id = ?
          AND role = 'assistant'
          AND run_status IS NOT NULL
        ORDER BY position DESC
        LIMIT 1`,
    )
    .get(conversationId) as DbRow | undefined;
  return conversationRunSummaryFromRow(row);
}

function totalConversationRunDurationMs(db: SqliteDb, conversationId: string): number | undefined {
  const row = db
    .prepare(
      `SELECT SUM(${terminalRunDurationSql()}) AS totalDurationMs
         FROM messages
        WHERE conversation_id = ?
          AND role = 'assistant'
          AND run_status IN ('succeeded', 'failed', 'canceled')`,
    )
    .get(conversationId) as DbRow | undefined;
  return row?.totalDurationMs == null ? undefined : Number(row.totalDurationMs);
}

function terminalRunDurationSql(alias?: string) {
  const p = alias ? `${alias}.` : '';
  return `CASE
            WHEN ${p}started_at IS NOT NULL AND ${p}ended_at IS NOT NULL THEN
              CASE
                WHEN CAST(${p}ended_at AS INTEGER) >= CAST(${p}started_at AS INTEGER)
                  THEN CAST(${p}ended_at AS INTEGER) - CAST(${p}started_at AS INTEGER)
                ELSE 0
              END
            ELSE (
              SELECT CASE
                       WHEN json_extract(usage_event.value, '$.durationMs') >= 0
                         THEN json_extract(usage_event.value, '$.durationMs')
                       ELSE 0
                     END
                FROM json_each(
                  CASE
                    WHEN json_valid(${p}events_json) AND json_type(${p}events_json) = 'array'
                      THEN ${p}events_json
                    ELSE '[]'
                  END
                ) AS usage_event
               WHERE usage_event.type = 'object'
                 AND json_extract(usage_event.value, '$.kind') = 'usage'
                 AND json_type(usage_event.value, '$.durationMs') IN ('integer', 'real')
               ORDER BY CAST(usage_event.key AS INTEGER) DESC
               LIMIT 1
            )
          END`;
}

function conversationRunSummaryFromRow(row: DbRow | undefined) {
  if (!row || typeof row.runStatus !== 'string') return null;
  const startedAt = row.startedAt == null ? undefined : Number(row.startedAt);
  const endedAt = row.endedAt == null ? undefined : Number(row.endedAt);
  const usageDurationMs = latestUsageDurationMs(row.eventsJson);
  const durationMs =
    Number.isFinite(startedAt) && Number.isFinite(endedAt)
      ? Math.max(0, (endedAt as number) - (startedAt as number))
      : usageDurationMs;
  return {
    status: row.runStatus,
    ...(Number.isFinite(startedAt) ? { startedAt } : {}),
    ...(Number.isFinite(endedAt) ? { endedAt } : {}),
    ...(typeof durationMs === 'number' && Number.isFinite(durationMs)
      ? { durationMs }
      : {}),
  };
}

function latestUsageDurationMs(eventsJson: unknown): number | undefined {
  if (typeof eventsJson !== 'string' || eventsJson.length === 0) return undefined;
  try {
    const events = JSON.parse(eventsJson);
    if (!Array.isArray(events)) return undefined;
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (
        event &&
        typeof event === 'object' &&
        event.kind === 'usage' &&
        typeof event.durationMs === 'number' &&
        Number.isFinite(event.durationMs)
      ) {
        return Math.max(0, event.durationMs);
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function insertConversation(db: SqliteDb, c: DbRow) {
  if (isDaemonDbPostgres()) {
    const created = normalizeConversation({
      id: c.id,
      projectId: c.projectId,
      title: c.title ?? null,
      sessionMode: c.sessionMode,
      messageCount: 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    });
    upsertCachedConversation(String(c.projectId), created as DbRow);
    mirrorConversationRowToSqlite(db, c);
    schedulePostgresWrite(async () => {
      await pgCore.pgInsertConversation(getPostgresPool(), c);
    });
    return created;
  }
  db.prepare(
    `INSERT INTO conversations
       (id, project_id, title, session_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    c.id,
    c.projectId,
    c.title ?? null,
    normalizeConversationSessionMode(c.sessionMode),
    c.createdAt,
    c.updatedAt,
  );
  return getConversation(db, c.id);
}

/** Postgres: await durable conversation insert on project create. */
export async function insertConversationAsync(db: SqliteDb, c: DbRow) {
  if (!isDaemonDbPostgres()) {
    return insertConversation(db, c);
  }
  const created = normalizeConversation({
    id: c.id,
    projectId: c.projectId,
    title: c.title ?? null,
    sessionMode: c.sessionMode,
    messageCount: 0,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  });
  upsertCachedConversation(String(c.projectId), created as DbRow);
  mirrorConversationRowToSqlite(db, c);
  await pgCore.pgInsertConversation(getPostgresPool(), c);
  return created;
}

export function updateConversation(db: SqliteDb, id: string, patch: DbRow) {
  if (isDaemonDbPostgres()) {
    const base = getConversation(db, id);
    if (!base) return null;
    const merged = {
      ...base,
      ...patch,
      sessionMode: Object.prototype.hasOwnProperty.call(patch, 'sessionMode')
        ? normalizeConversationSessionMode(patch.sessionMode)
        : base.sessionMode,
      updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now(),
    };
    invalidateCachedConversations(base.projectId);
    mirrorConversationRowToSqlite(db, {
      id: merged.id,
      projectId: merged.projectId,
      title: merged.title ?? null,
      sessionMode: merged.sessionMode,
      createdAt: merged.createdAt,
      updatedAt: merged.updatedAt,
    });
    schedulePostgresWrite(async () => {
      await pgCore.pgUpdateConversation(getPostgresPool(), id, merged);
    });
    return merged;
  }
  const existing = getConversation(db, id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...patch,
    sessionMode: Object.prototype.hasOwnProperty.call(patch, 'sessionMode')
      ? normalizeConversationSessionMode(patch.sessionMode)
      : existing.sessionMode,
    updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now(),
  };
  db.prepare(
    `UPDATE conversations
        SET title = ?, session_mode = ?, updated_at = ? WHERE id = ?`,
  ).run(merged.title ?? null, merged.sessionMode, merged.updatedAt, id);
  return getConversation(db, id);
}

export function deleteConversation(db: SqliteDb, id: string) {
  if (isDaemonDbPostgres()) {
    const existing = getConversation(db, id);
    if (existing?.projectId) invalidateCachedConversations(existing.projectId);
    invalidateCachedMessages(id);
    schedulePostgresWrite(async () => {
      await pgCore.pgDeleteConversation(getPostgresPool(), id);
    });
    return;
  }
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
}

// ---------- agent sessions ----------

export function getAgentSession(
  db: SqliteDb,
  conversationId: string,
  agentId: string,
): string | null {
  if (isDaemonDbPostgres()) {
    // Postgres path reads from the in-process cache populated by
    // warmProjectFromPostgres. Cache miss returns null, matching sqlite
    // semantics; the next warm cycle will backfill after a follow-up read.
    const hit = getCachedAgentSession(conversationId, agentId);
    return hit?.sessionId ?? null;
  }
  const row = db
    .prepare(
      `SELECT session_id FROM agent_sessions
        WHERE conversation_id = ? AND agent_id = ?`,
    )
    .get(conversationId, agentId) as DbRow | undefined;
  return row && typeof row.session_id === 'string' ? row.session_id : null;
}

export function upsertAgentSession(
  db: SqliteDb,
  input: {
    conversationId: string;
    agentId: string;
    sessionId: string;
    stablePromptHash?: string | null;
  },
): void {
  if (isDaemonDbPostgres()) {
    // Postgres becomes the SSOT for agent sessions. Update the cache
    // synchronously so subsequent sync reads see the latest session, then
    // schedule the durable pg write.
    setCachedAgentSession(input.conversationId, input.agentId, {
      sessionId: input.sessionId,
      stablePromptHash: input.stablePromptHash ?? null,
    });
    schedulePostgresWrite(async () => {
      await pgCore.pgUpsertAgentSession(getPostgresPool(), input);
    });
    return;
  }
  db.prepare(
    `INSERT INTO agent_sessions (conversation_id, agent_id, session_id, stable_prompt_hash, updated_at)
       VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(conversation_id, agent_id)
       DO UPDATE SET session_id = excluded.session_id,
                     stable_prompt_hash = excluded.stable_prompt_hash,
                     updated_at = excluded.updated_at`,
  ).run(
    input.conversationId,
    input.agentId,
    input.sessionId,
    input.stablePromptHash ?? null,
    Date.now(),
  );
}

export function getAgentSessionRecord(
  db: SqliteDb,
  conversationId: string,
  agentId: string,
): { sessionId: string; stablePromptHash: string | null } | null {
  if (isDaemonDbPostgres()) {
    const hit = getCachedAgentSession(conversationId, agentId);
    if (!hit) return null;
    return { sessionId: hit.sessionId, stablePromptHash: hit.stablePromptHash };
  }
  const row = db
    .prepare(
      `SELECT session_id, stable_prompt_hash FROM agent_sessions
        WHERE conversation_id = ? AND agent_id = ?`,
    )
    .get(conversationId, agentId) as DbRow | undefined;
  if (!row || typeof row.session_id !== 'string') return null;
  return {
    sessionId: row.session_id,
    stablePromptHash:
      typeof row.stable_prompt_hash === 'string' ? row.stable_prompt_hash : null,
  };
}

export function updateAgentSessionStableHash(
  db: SqliteDb,
  conversationId: string,
  agentId: string,
  stablePromptHash: string,
): void {
  if (isDaemonDbPostgres()) {
    const existing = getCachedAgentSession(conversationId, agentId);
    if (existing) {
      setCachedAgentSession(conversationId, agentId, {
        sessionId: existing.sessionId,
        stablePromptHash,
      });
    }
    schedulePostgresWrite(async () => {
      await pgCore.pgUpdateAgentSessionStableHash(
        getPostgresPool(),
        conversationId,
        agentId,
        stablePromptHash,
      );
    });
    return;
  }
  db.prepare(
    `UPDATE agent_sessions SET stable_prompt_hash = ?, updated_at = ?
      WHERE conversation_id = ? AND agent_id = ?`,
  ).run(stablePromptHash, Date.now(), conversationId, agentId);
}

export function clearAgentSession(
  db: SqliteDb,
  conversationId: string,
  agentId: string,
): void {
  if (isDaemonDbPostgres()) {
    deleteCachedAgentSession(conversationId, agentId);
    schedulePostgresWrite(async () => {
      await pgCore.pgClearAgentSession(getPostgresPool(), conversationId, agentId);
    });
    return;
  }
  db.prepare(
    `DELETE FROM agent_sessions WHERE conversation_id = ? AND agent_id = ?`,
  ).run(conversationId, agentId);
}

// ---------- messages ----------

export function listMessages(db: SqliteDb, conversationId: string) {
  if (isDaemonDbPostgres()) {
    const cached = getCachedMessages(conversationId);
    return cached ? cached.map((row) => normalizeMessage(row)) : [];
  }
  return (db
    .prepare(
      `SELECT id, role, content, agent_id AS agentId, agent_name AS agentName,
              run_id AS runId, run_status AS runStatus,
              last_run_event_id AS lastRunEventId,
              events_json AS eventsJson,
              attachments_json AS attachmentsJson,
              comment_attachments_json AS commentAttachmentsJson,
              produced_files_json AS producedFilesJson,
              feedback_json AS feedbackJson,
              pre_turn_file_names_json AS preTurnFileNamesJson,
              session_mode AS sessionMode,
              run_context_json AS runContextJson,
              applied_plugin_snapshot_json AS appliedPluginSnapshotJson,
              created_at AS createdAt, started_at AS startedAt, ended_at AS endedAt,
              position
         FROM messages
        WHERE conversation_id = ?
        ORDER BY position ASC`,
    )
    .all(conversationId) as DbRow[])
    .map(normalizeMessage);
}

export async function listMessagesAsync(db: SqliteDb, conversationId: string) {
  if (!isDaemonDbPostgres()) return listMessages(db, conversationId);
  const rows = await pgCore.pgListMessages(getPostgresPool(), conversationId);
  const normalized = rows.map((row) => normalizeMessage(row));
  setCachedMessages(conversationId, normalized);
  return normalized;
}

export function upsertMessage(db: SqliteDb, conversationId: string, m: DbRow) {
  if (isDaemonDbPostgres()) {
    const now = Date.now();
    const cached = getCachedMessages(conversationId) ?? [];
    const existing = cached.find((row) => row.id === m.id);
    const position = existing && typeof existing.position === 'number'
      ? Number(existing.position)
      : cached.reduce((max, row) => Math.max(max, Number(row.position ?? -1)), -1) + 1;
    const normalized = normalizeMessage({
      id: m.id,
      role: m.role,
      content: m.content,
      agentId: m.agentId ?? null,
      agentName: m.agentName ?? null,
      runId: m.runId ?? null,
      runStatus: m.runStatus ?? null,
      lastRunEventId: m.lastRunEventId ?? null,
      eventsJson: m.events ? JSON.stringify(m.events) : null,
      attachmentsJson: m.attachments ? JSON.stringify(m.attachments) : null,
      commentAttachmentsJson: m.commentAttachments ? JSON.stringify(m.commentAttachments) : null,
      producedFilesJson: m.producedFiles ? JSON.stringify(m.producedFiles) : null,
      feedbackJson: m.feedback ? JSON.stringify(m.feedback) : null,
      preTurnFileNamesJson: m.preTurnFileNames ? JSON.stringify(m.preTurnFileNames) : null,
      sessionMode: m.sessionMode ?? null,
      runContextJson: m.runContext ? JSON.stringify(m.runContext) : null,
      appliedPluginSnapshotJson: m.appliedPluginSnapshot ? JSON.stringify(m.appliedPluginSnapshot) : null,
      createdAt: m.createdAt ?? now,
      startedAt: m.startedAt ?? null,
      endedAt: m.endedAt ?? null,
      position,
    });
    const nextCache = existing
      ? cached.map((row) => (row.id === m.id ? normalized : row))
      : [...cached, normalized];
    setCachedMessages(conversationId, nextCache);
    const conversation = getCachedConversationById(conversationId);
    if (conversation?.projectId) invalidateCachedConversations(String(conversation.projectId));
    schedulePostgresWrite(async () => {
      await pgCore.pgUpsertMessage(getPostgresPool(), conversationId, m);
      // Only touch conversation row when it is already in cache — otherwise
      // we'd overwrite title with null on cold paths (insertConversation race).
      if (conversation) {
        await pgCore.pgUpdateConversation(getPostgresPool(), conversationId, {
          title: conversation.title ?? null,
          sessionMode: conversation.sessionMode ?? 'design',
          updatedAt: now,
        });
      }
    });
    return normalized;
  }
  const existing = db
    .prepare(`SELECT position FROM messages WHERE id = ?`)
    .get(m.id) as DbRow | undefined;
  const now = Date.now();
  if (existing) {
    db.prepare(
      `UPDATE messages
          SET role = ?, content = ?, agent_id = ?, agent_name = ?,
              run_id = ?, run_status = ?, last_run_event_id = ?,
              events_json = ?, attachments_json = ?, comment_attachments_json = ?,
              produced_files_json = ?, feedback_json = ?,
              pre_turn_file_names_json = ?,
              session_mode = ?, run_context_json = ?, applied_plugin_snapshot_json = ?,
              telemetry_finalized_at = CASE
                WHEN ? THEN COALESCE(telemetry_finalized_at, ?)
                ELSE telemetry_finalized_at
              END,
              started_at = ?, ended_at = ?
        WHERE id = ?`,
    ).run(
      m.role,
      m.content,
      m.agentId ?? null,
      m.agentName ?? null,
      m.runId ?? null,
      m.runStatus ?? null,
      m.lastRunEventId ?? null,
      m.events ? JSON.stringify(m.events) : null,
      m.attachments ? JSON.stringify(m.attachments) : null,
      m.commentAttachments ? JSON.stringify(m.commentAttachments) : null,
      m.producedFiles ? JSON.stringify(m.producedFiles) : null,
      m.feedback ? JSON.stringify(m.feedback) : null,
      m.preTurnFileNames ? JSON.stringify(m.preTurnFileNames) : null,
      normalizeMessageSessionModeForStorage(m.sessionMode),
      m.runContext ? JSON.stringify(m.runContext) : null,
      m.appliedPluginSnapshot ? JSON.stringify(m.appliedPluginSnapshot) : null,
      m.telemetryFinalized === true ? 1 : 0,
      now,
      m.startedAt ?? null,
      m.endedAt ?? null,
      m.id,
    );
  } else {
    const max = db
      .prepare(
        `SELECT COALESCE(MAX(position), -1) AS m FROM messages WHERE conversation_id = ?`,
      )
      .get(conversationId) as DbRow | undefined;
    const position = (max?.m ?? -1) + 1;
    // 23 values: id, conversation_id, role, content, agent_id, agent_name,
    // run_id, run_status, last_run_event_id, events_json, attachments_json,
    // comment_attachments_json, produced_files_json, feedback_json,
    // pre_turn_file_names_json, session_mode, run_context_json,
    // applied_plugin_snapshot_json, telemetry_finalized_at, started_at,
    // ended_at, position, created_at.
    db.prepare(
      `INSERT INTO messages
         (id, conversation_id, role, content, agent_id, agent_name,
          run_id, run_status, last_run_event_id, events_json,
          attachments_json, comment_attachments_json, produced_files_json,
          feedback_json, pre_turn_file_names_json,
          session_mode, run_context_json, applied_plugin_snapshot_json,
          telemetry_finalized_at, started_at, ended_at, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      m.id,
      conversationId,
      m.role,
      m.content,
      m.agentId ?? null,
      m.agentName ?? null,
      m.runId ?? null,
      m.runStatus ?? null,
      m.lastRunEventId ?? null,
      m.events ? JSON.stringify(m.events) : null,
      m.attachments ? JSON.stringify(m.attachments) : null,
      m.commentAttachments ? JSON.stringify(m.commentAttachments) : null,
      m.producedFiles ? JSON.stringify(m.producedFiles) : null,
      m.feedback ? JSON.stringify(m.feedback) : null,
      m.preTurnFileNames ? JSON.stringify(m.preTurnFileNames) : null,
      normalizeMessageSessionModeForStorage(m.sessionMode),
      m.runContext ? JSON.stringify(m.runContext) : null,
      m.appliedPluginSnapshot ? JSON.stringify(m.appliedPluginSnapshot) : null,
      m.telemetryFinalized === true ? now : null,
      m.startedAt ?? null,
      m.endedAt ?? null,
      position,
      now,
    );
  }
  // Bump conversation activity so the sidebar's recency sort works.
  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(
    now,
    conversationId,
  );
  const row = db
    .prepare(
      `SELECT id, role, content, agent_id AS agentId, agent_name AS agentName,
              run_id AS runId, run_status AS runStatus,
              last_run_event_id AS lastRunEventId,
              events_json AS eventsJson,
              attachments_json AS attachmentsJson,
              comment_attachments_json AS commentAttachmentsJson,
              produced_files_json AS producedFilesJson,
              feedback_json AS feedbackJson,
              pre_turn_file_names_json AS preTurnFileNamesJson,
              session_mode AS sessionMode,
              run_context_json AS runContextJson,
              applied_plugin_snapshot_json AS appliedPluginSnapshotJson,
              created_at AS createdAt, started_at AS startedAt, ended_at AS endedAt,
              position
         FROM messages WHERE id = ?`,
    )
    .get(m.id) as DbRow | undefined;
  return row ? normalizeMessage(row) : null;
}

export function getMessageTelemetryFinalizationState(db: SqliteDb, messageId: string) {
  const row = db
    .prepare(
      `SELECT telemetry_finalized_at AS telemetryFinalizedAt
         FROM messages
        WHERE id = ?`,
    )
    .get(messageId) as DbRow | undefined;
  if (!row) {
    return {
      exists: false,
      finalizedAt: null,
    };
  }
  return {
    exists: true,
    finalizedAt:
      typeof row.telemetryFinalizedAt === 'number' ? row.telemetryFinalizedAt : null,
  };
}

export function appendMessageStatusEvent(db: SqliteDb, messageId: string, event: DbRow) {
  const label = typeof event?.label === 'string' ? event.label.trim() : '';
  const detail = typeof event?.detail === 'string' ? event.detail.trim() : '';
  if (!label) return null;

  if (isDaemonDbPostgres()) {
    const hit = findCachedMessage(messageId);
    if (!hit) return null;
    const events = Array.isArray(hit.message.events) ? [...(hit.message.events as DbRow[])] : [];
    const last = events[events.length - 1];
    if (last?.kind === 'status' && last.label === label && (last.detail ?? '') === detail) {
      return events;
    }
    const nextEvent = detail
      ? { kind: 'status', label, detail }
      : { kind: 'status', label };
    const next = [...events, nextEvent];
    const merged = { ...hit.message, events: next };
    updateCachedMessage(hit.conversationId, hit.index, merged);
    schedulePostgresWrite(async () => {
      await pgCore.pgUpsertMessage(getPostgresPool(), hit.conversationId, messageRowForPgUpsert(messageId, merged, next));
    });
    return next;
  }

  const row = db
    .prepare(`SELECT events_json AS eventsJson FROM messages WHERE id = ?`)
    .get(messageId) as DbRow | undefined;
  if (!row) return null;
  const parsed = parseJsonOrUndef(row.eventsJson);
  const events = Array.isArray(parsed) ? parsed : [];
  const last = events[events.length - 1];
  if (last?.kind === 'status' && last.label === label && (last.detail ?? '') === detail) {
    return events;
  }
  const nextEvent = detail
    ? { kind: 'status', label, detail }
    : { kind: 'status', label };
  const next = [...events, nextEvent];
  db.prepare(`UPDATE messages SET events_json = ? WHERE id = ?`)
    .run(JSON.stringify(next), messageId);
  return next;
}

export function appendMessageAgentEvent(db: SqliteDb, messageId: string, event: DbRow) {
  if (!event || typeof event !== 'object') return null;
  const kind = typeof event.kind === 'string' ? event.kind : '';
  if (!kind) return null;

  if (isDaemonDbPostgres()) {
    const hit = findCachedMessage(messageId);
    if (!hit) return null;
    const events = Array.isArray(hit.message.events) ? [...(hit.message.events as DbRow[])] : [];
    const last = events[events.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(event)) return events;
    const next = [...events, event];
    const textDelta = kind === 'text' && typeof event.text === 'string' ? event.text : '';
    const content = String(hit.message.content ?? '') + textDelta;
    const merged = { ...hit.message, content, events: next };
    updateCachedMessage(hit.conversationId, hit.index, merged);
    schedulePostgresWrite(async () => {
      await pgCore.pgUpsertMessage(getPostgresPool(), hit.conversationId, messageRowForPgUpsert(messageId, merged, next));
    });
    return next;
  }

  const row = db
    .prepare(`SELECT content, events_json AS eventsJson FROM messages WHERE id = ?`)
    .get(messageId) as DbRow | undefined;
  if (!row) return null;
  const parsed = parseJsonOrUndef(row.eventsJson);
  const events = Array.isArray(parsed) ? parsed : [];
  const last = events[events.length - 1];
  if (last && JSON.stringify(last) === JSON.stringify(event)) {
    return events;
  }
  const next = [...events, event];
  const textDelta = kind === 'text' && typeof event.text === 'string' ? event.text : '';
  db.prepare(`UPDATE messages SET content = COALESCE(content, '') || ?, events_json = ? WHERE id = ?`)
    .run(textDelta, JSON.stringify(next), messageId);
  return next;
}

export function deleteMessage(db: SqliteDb, id: string) {
  db.prepare(`DELETE FROM messages WHERE id = ?`).run(id);
}

// ---------- preview comments ----------

const PREVIEW_COMMENT_STATUSES = new Set([
  'open',
  'attached',
  'applying',
  'needs_review',
  'resolved',
  'failed',
]);

export function listPreviewComments(db: SqliteDb, projectId: string, conversationId: string) {
  if (isDaemonDbPostgres()) {
    const cached = getCachedPreviewComments(projectId, conversationId);
    return (cached ?? []).map((row) => normalizePreviewComment(row as DbRow));
  }
  return (db
    .prepare(
      `SELECT id, project_id AS projectId, conversation_id AS conversationId,
              file_path AS filePath, element_id AS elementId, selector, label,
              text, position_json AS positionJson, html_hint AS htmlHint,
              selection_kind AS selectionKind, member_count AS memberCount,
              pod_members_json AS podMembersJson, style_json AS styleJson,
              attachments_json AS attachmentsJson,
              slide_index AS slideIndex,
              note, status, created_at AS createdAt, updated_at AS updatedAt
         FROM preview_comments
        WHERE project_id = ? AND conversation_id = ?
        ORDER BY created_at ASC, rowid ASC`,
    )
    .all(projectId, conversationId) as DbRow[])
    .map(normalizePreviewComment);
}

export function upsertPreviewComment(db: SqliteDb, projectId: string, conversationId: string, input: DbRow) {
  const target = input?.target ?? {};
  const note = typeof input?.note === 'string' ? input.note.trim() : '';
  const attachmentsProvided = Object.prototype.hasOwnProperty.call(input ?? {}, 'attachments');
  const incomingAttachments = normalizePreviewCommentAttachments(input?.attachments);
  const filePath = cleanRequiredString(target.filePath, 'filePath');
  const elementId = cleanRequiredString(target.elementId, 'elementId');
  const selector = cleanRequiredString(target.selector, 'selector');
  const label = cleanRequiredString(target.label, 'label');
  const text = typeof target.text === 'string' ? compactWhitespace(target.text).slice(0, 160) : '';
  const htmlHint = typeof target.htmlHint === 'string' ? compactWhitespace(target.htmlHint).slice(0, 180) : '';
  const position = normalizePosition(target.position);
  const selectionKind = target.selectionKind === 'pod' ? 'pod' : 'element';
  const podMembers = selectionKind === 'pod' ? normalizePodMembers(target.podMembers) : [];
  const style = normalizeAnnotationStyle(target.style);
  const memberCount = selectionKind === 'pod'
    ? (podMembers.length > 0
        ? podMembers.length
        : Number.isFinite(target.memberCount)
          ? Math.max(0, Math.round(target.memberCount))
          : 0)
    : 0;
  const slideIndex = Number.isFinite(target.slideIndex) ? Math.max(0, Math.round(target.slideIndex)) : null;
  const slideKey = slideIndex ?? -1;
  const now = Date.now();

  if (isDaemonDbPostgres()) {
    let cached = getCachedPreviewComments(projectId, conversationId);
    if (!cached) {
      // Warm miss — start with an empty list so upsertCachedPreviewComment
      // has a bucket to write into. A subsequent full warm will overwrite
      // this with the authoritative Postgres snapshot.
      cached = [];
      setCachedPreviewComments(projectId, conversationId, cached);
    }
    const existing = cached.find((row) => {
      const r = row as DbRow;
      return r.filePath === filePath && r.elementId === elementId && Number(r.slideKey ?? -1) === slideKey;
    }) as DbRow | undefined;
    const id = (existing?.id as string) ?? randomCommentId();
    const createdAt = Number(existing?.createdAt ?? now);
    const existingAttachments = normalizePreviewCommentAttachments(existing?.attachments);
    const attachments = attachmentsProvided ? incomingAttachments : existingAttachments;
    if (!note && attachments.length === 0) throw new Error('comment note required');
    const rowForCache: DbRow = {
      id,
      projectId,
      conversationId,
      filePath,
      elementId,
      selector,
      label,
      text,
      positionJson: JSON.stringify(position),
      htmlHint,
      selectionKind,
      memberCount: selectionKind === 'pod' ? memberCount : null,
      podMembersJson: selectionKind === 'pod' ? JSON.stringify(podMembers) : null,
      styleJson: style ? JSON.stringify(style) : null,
      attachmentsJson: attachments.length > 0 ? JSON.stringify(attachments) : null,
      slideIndex,
      slideKey,
      note,
      status: 'open',
      createdAt,
      updatedAt: now,
    };
    upsertCachedPreviewComment(projectId, conversationId, rowForCache);
    schedulePostgresWrite(async () => {
      await pgCore.pgUpsertPreviewComment(getPostgresPool(), {
        id,
        projectId,
        conversationId,
        filePath,
        elementId,
        selector,
        label,
        text,
        positionJson: rowForCache.positionJson as string,
        htmlHint,
        selectionKind,
        memberCount: rowForCache.memberCount as number | null,
        podMembersJson: rowForCache.podMembersJson as string | null,
        styleJson: rowForCache.styleJson as string | null,
        attachmentsJson: rowForCache.attachmentsJson as string | null,
        slideIndex,
        slideKey,
        note,
        status: 'open',
        createdAt,
        updatedAt: now,
      });
    });
    return normalizePreviewComment(rowForCache);
  }

  const existing = db
    .prepare(
      `SELECT id, created_at AS createdAt, attachments_json AS attachmentsJson
         FROM preview_comments
        WHERE project_id = ? AND conversation_id = ? AND file_path = ? AND element_id = ? AND slide_key = ?`,
    )
    .get(projectId, conversationId, filePath, elementId, slideKey) as DbRow | undefined;
  const id = existing?.id ?? randomCommentId();
  const createdAt = existing?.createdAt ?? now;
  const existingAttachments = normalizePreviewCommentAttachments(parseJsonOrUndef(existing?.attachmentsJson));
  const attachments = attachmentsProvided ? incomingAttachments : existingAttachments;
  // A comment must carry either a note or at least one image attachment.
  if (!note && attachments.length === 0) throw new Error('comment note required');
  db.prepare(
    `INSERT INTO preview_comments
       (id, project_id, conversation_id, file_path, element_id, selector, label,
        text, position_json, html_hint, selection_kind, member_count, pod_members_json,
        style_json, attachments_json, slide_index, slide_key, note, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, conversation_id, file_path, element_id, slide_key) DO UPDATE SET
       selector = excluded.selector,
       label = excluded.label,
       text = excluded.text,
       position_json = excluded.position_json,
       html_hint = excluded.html_hint,
       selection_kind = excluded.selection_kind,
       member_count = excluded.member_count,
       pod_members_json = excluded.pod_members_json,
       style_json = excluded.style_json,
       attachments_json = excluded.attachments_json,
       slide_index = excluded.slide_index,
       note = excluded.note,
       status = 'open',
       updated_at = excluded.updated_at`,
  ).run(
    id,
    projectId,
    conversationId,
    filePath,
    elementId,
    selector,
    label,
    text,
    JSON.stringify(position),
    htmlHint,
    selectionKind,
    selectionKind === 'pod' ? memberCount : null,
    selectionKind === 'pod' ? JSON.stringify(podMembers) : null,
    style ? JSON.stringify(style) : null,
    attachments.length > 0 ? JSON.stringify(attachments) : null,
    slideIndex,
    slideKey,
    note,
    'open',
    createdAt,
    now,
  );
  return getPreviewComment(db, projectId, conversationId, id);
}

export function updatePreviewCommentStatus(db: SqliteDb, projectId: string, conversationId: string, id: string, status: string) {
  if (!PREVIEW_COMMENT_STATUSES.has(status)) throw new Error('invalid comment status');
  const now = Date.now();
  if (isDaemonDbPostgres()) {
    const cached = getCachedPreviewComments(projectId, conversationId) ?? [];
    const existing = cached.find((row) => String((row as DbRow).id) === id) as DbRow | undefined;
    if (existing) {
      const merged = { ...existing, status, updatedAt: now };
      upsertCachedPreviewComment(projectId, conversationId, merged);
      schedulePostgresWrite(async () => {
        await pgCore.pgUpdatePreviewCommentStatus(
          getPostgresPool(),
          projectId,
          conversationId,
          id,
          status,
          now,
        );
      });
      return normalizePreviewComment(merged);
    }
    // Not cached — issue the async write anyway; caller will re-fetch after
    // the next warm cycle.
    schedulePostgresWrite(async () => {
      await pgCore.pgUpdatePreviewCommentStatus(
        getPostgresPool(),
        projectId,
        conversationId,
        id,
        status,
        now,
      );
    });
    return null;
  }
  db.prepare(
    `UPDATE preview_comments
        SET status = ?, updated_at = ?
      WHERE id = ? AND project_id = ? AND conversation_id = ?`,
  ).run(status, now, id, projectId, conversationId);
  return getPreviewComment(db, projectId, conversationId, id);
}

export function deletePreviewComment(db: SqliteDb, projectId: string, conversationId: string, id: string) {
  if (isDaemonDbPostgres()) {
    const removed = removeCachedPreviewComment(projectId, conversationId, id);
    schedulePostgresWrite(async () => {
      await pgCore.pgDeletePreviewComment(getPostgresPool(), projectId, conversationId, id);
    });
    // We don't know for sure whether the row existed in Postgres, but the
    // caller's contract mirrors sqlite semantics (true when locally
    // observed). removed==false with a warm cache means "not present" —
    // safe to report false. When the cache is cold we optimistically
    // report true; the async delete will no-op if the row was already
    // gone.
    if (removed) return true;
    return getCachedPreviewComments(projectId, conversationId) == null;
  }
  const result = db
    .prepare(
      `DELETE FROM preview_comments
        WHERE id = ? AND project_id = ? AND conversation_id = ?`,
    )
    .run(id, projectId, conversationId);
  return result.changes > 0;
}

function getPreviewComment(db: SqliteDb, projectId: string, conversationId: string, id: string) {
  const row = db
    .prepare(
      `SELECT id, project_id AS projectId, conversation_id AS conversationId,
              file_path AS filePath, element_id AS elementId, selector, label,
              text, position_json AS positionJson, html_hint AS htmlHint,
              selection_kind AS selectionKind, member_count AS memberCount,
              pod_members_json AS podMembersJson, style_json AS styleJson,
              attachments_json AS attachmentsJson,
              slide_index AS slideIndex,
              note, status, created_at AS createdAt, updated_at AS updatedAt
         FROM preview_comments
        WHERE id = ? AND project_id = ? AND conversation_id = ?`,
    )
    .get(id, projectId, conversationId) as DbRow | undefined;
  return row ? normalizePreviewComment(row) : null;
}

function normalizePreviewComment(row: DbRow) {
  const podMembers = parseJsonOrUndef(row.podMembersJson);
  const normalizedPodMembers = Array.isArray(podMembers) ? podMembers : undefined;
  return {
    id: row.id,
    projectId: row.projectId,
    conversationId: row.conversationId,
    filePath: row.filePath,
    elementId: row.elementId,
    selector: row.selector,
    label: row.label,
    text: row.text,
    position: parseJsonOrUndef(row.positionJson) ?? { x: 0, y: 0, width: 0, height: 0 },
    htmlHint: row.htmlHint,
    style: normalizeAnnotationStyle(parseJsonOrUndef(row.styleJson)),
    selectionKind: row.selectionKind === 'pod' ? 'pod' : 'element',
    memberCount:
      normalizedPodMembers && normalizedPodMembers.length > 0
        ? normalizedPodMembers.length
        : Number.isFinite(row.memberCount)
          ? row.memberCount
          : undefined,
    podMembers: normalizedPodMembers,
    slideIndex: Number.isFinite(row.slideIndex) ? row.slideIndex : undefined,
    note: row.note,
    attachments: normalizePreviewCommentAttachments(parseJsonOrUndef(row.attachmentsJson)),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizePreviewCommentAttachments(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const path = typeof (item as DbRow).path === 'string' ? (item as DbRow).path.trim() : '';
      if (!path) return null;
      const rawName = typeof (item as DbRow).name === 'string' ? (item as DbRow).name.trim() : '';
      return { path, name: rawName || path.split('/').pop() || path };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function cleanRequiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} required`);
  return value.trim();
}

function normalizePodMembers(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((member) => {
      if (!member || typeof member !== 'object') return null;
      const elementId = cleanRequiredString(member.elementId, 'podMember.elementId');
      const selector = cleanRequiredString(member.selector, 'podMember.selector');
      const label = cleanRequiredString(member.label, 'podMember.label');
      return {
        elementId,
        selector,
        label,
        text:
          typeof member.text === 'string'
            ? compactWhitespace(member.text).slice(0, 160)
            : '',
        position: normalizePosition(member.position),
        htmlHint:
          typeof member.htmlHint === 'string'
            ? compactWhitespace(member.htmlHint).slice(0, 180)
            : '',
        style: normalizeAnnotationStyle(member.style),
      };
    })
    .filter(Boolean);
}

function normalizeAnnotationStyle(input: unknown) {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as DbRow;
  const style: DbRow = {};
  for (const key of ANNOTATION_STYLE_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = compactWhitespace(value);
    if (trimmed) style[key] = trimmed.slice(0, 120);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

const ANNOTATION_STYLE_KEYS = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'fontFamily',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderRadius',
] as const;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizePosition(input: unknown) {
  const value: DbRow = input && typeof input === 'object' ? input as DbRow : {};
  return {
    x: finiteNumber(value.x),
    y: finiteNumber(value.y),
    width: finiteNumber(value.width),
    height: finiteNumber(value.height),
  };
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function randomCommentId(): string {
  return `cmt_${randomUUID().slice(0, 8)}`;
}

function normalizeMessage(row: DbRow) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    agentId: row.agentId ?? undefined,
    agentName: row.agentName ?? undefined,
    runId: row.runId ?? undefined,
    runStatus: row.runStatus ?? undefined,
    lastRunEventId: row.lastRunEventId ?? undefined,
    events: parseJsonOrUndef(row.eventsJson),
    attachments: parseJsonOrUndef(row.attachmentsJson),
    commentAttachments: parseJsonOrUndef(row.commentAttachmentsJson),
    producedFiles: parseJsonOrUndef(row.producedFilesJson),
    feedback: parseJsonOrUndef(row.feedbackJson),
    preTurnFileNames: parseJsonOrUndef(row.preTurnFileNamesJson),
    sessionMode: normalizeMessageSessionMode(row.sessionMode),
    runContext: parseJsonOrUndef(row.runContextJson),
    appliedPluginSnapshot: parseJsonOrUndef(row.appliedPluginSnapshotJson),
    createdAt: row.createdAt ?? undefined,
    startedAt: row.startedAt ?? undefined,
    endedAt: row.endedAt ?? undefined,
  };
}

function normalizeMessageSessionMode(value: unknown): ChatSessionMode | undefined {
  return value === 'chat' || value === 'design' ? value : undefined;
}

function normalizeMessageSessionModeForStorage(value: unknown): ChatSessionMode | null {
  return value === 'chat' || value === 'design' ? value : null;
}

function parseJsonOrUndef(s: unknown): any {
  if (typeof s !== 'string' || !s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// ---------- routines ----------

const ROUTINE_COLS = `id, name, prompt,
  schedule_kind AS scheduleKind, schedule_value AS scheduleValue,
  schedule_json AS scheduleJson,
  project_mode AS projectMode, project_id AS projectId,
  skill_id AS skillId, agent_id AS agentId,
  context_json AS contextJson,
  enabled, created_at AS createdAt, updated_at AS updatedAt`;

const ROUTINE_RUN_COLS = `id, routine_id AS routineId, trigger, status,
  project_id AS projectId, conversation_id AS conversationId,
  agent_run_id AS agentRunId, started_at AS startedAt,
  completed_at AS completedAt, summary, error, error_code AS errorCode`;

export function listRoutines(db: SqliteDb) {
  return (db
    .prepare(`SELECT ${ROUTINE_COLS} FROM routines ORDER BY created_at ASC`)
    .all() as DbRow[])
    .map(normalizeRoutine);
}

function mirrorRoutineToSqlite(db: SqliteDb, r: DbRow): void {
  db.prepare(
    `INSERT INTO routines
       (id, name, prompt, schedule_kind, schedule_value, schedule_json,
        project_mode, project_id, skill_id, agent_id, context_json, enabled,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        prompt = excluded.prompt,
        schedule_kind = excluded.schedule_kind,
        schedule_value = excluded.schedule_value,
        schedule_json = excluded.schedule_json,
        project_mode = excluded.project_mode,
        project_id = excluded.project_id,
        skill_id = excluded.skill_id,
        agent_id = excluded.agent_id,
        context_json = excluded.context_json,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at`,
  ).run(
    r.id,
    r.name,
    r.prompt,
    r.scheduleKind,
    r.scheduleValue,
    r.scheduleJson ?? null,
    r.projectMode,
    r.projectId ?? null,
    r.skillId ?? null,
    r.agentId ?? null,
    r.contextJson ?? null,
    r.enabled ? 1 : 0,
    r.createdAt,
    r.updatedAt,
  );
}

export async function warmRoutinesSqliteFromPostgres(db: SqliteDb): Promise<number> {
  if (!isDaemonDbPostgres()) return 0;
  const rows = await pgCore.pgListRoutines(getPostgresPool());
  for (const row of rows) {
    mirrorRoutineToSqlite(db, normalizeRoutine(row));
  }
  return rows.length;
}

export async function listRoutinesAsync(db: SqliteDb) {
  if (!isDaemonDbPostgres()) return listRoutines(db);
  const rows = await pgCore.pgListRoutines(getPostgresPool());
  return rows.map((row) => normalizeRoutine(row));
}

export async function getRoutineAsync(db: SqliteDb, id: string) {
  if (!isDaemonDbPostgres()) return getRoutine(db, id);
  const row = await pgCore.pgGetRoutine(getPostgresPool(), id);
  return row ? normalizeRoutine(row) : null;
}

export async function listRoutineRunsAsync(db: SqliteDb, routineId: string, limit = 20) {
  if (!isDaemonDbPostgres()) return listRoutineRuns(db, routineId, limit);
  const rows = await pgCore.pgListRoutineRuns(getPostgresPool(), routineId, limit);
  return rows.map(normalizeRoutineRun);
}

export async function getLatestRoutineRunAsync(db: SqliteDb, routineId: string) {
  if (!isDaemonDbPostgres()) return getLatestRoutineRun(db, routineId);
  const row = await pgCore.pgGetLatestRoutineRun(getPostgresPool(), routineId);
  return row ? normalizeRoutineRun(row) : null;
}

export async function getRoutineRunAsync(db: SqliteDb, id: string) {
  if (!isDaemonDbPostgres()) return getRoutineRun(db, id);
  const row = await pgCore.pgGetRoutineRun(getPostgresPool(), id);
  return row ? normalizeRoutineRun(row) : null;
}

export function getRoutine(db: SqliteDb, id: string) {
  const r = db
    .prepare(`SELECT ${ROUTINE_COLS} FROM routines WHERE id = ?`)
    .get(id) as DbRow | undefined;
  return r ? normalizeRoutine(r) : null;
}

export function insertRoutine(db: SqliteDb, r: DbRow) {
  db.prepare(
    `INSERT INTO routines
       (id, name, prompt, schedule_kind, schedule_value, schedule_json,
        project_mode, project_id, skill_id, agent_id, context_json, enabled,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    r.id,
    r.name,
    r.prompt,
    r.scheduleKind,
    r.scheduleValue,
    r.scheduleJson ?? null,
    r.projectMode,
    r.projectId ?? null,
    r.skillId ?? null,
    r.agentId ?? null,
    r.contextJson ?? null,
    r.enabled ? 1 : 0,
    r.createdAt,
    r.updatedAt,
  );
  if (isDaemonDbPostgres()) {
    // Dual-write to Postgres for cross-node visibility. Read path stays on
    // sqlite until routine service is async-refactored (Track B5.6).
    const snapshot = { ...r };
    schedulePostgresWrite(async () => {
      await pgCore.pgInsertRoutine(getPostgresPool(), snapshot);
    });
  }
  return getRoutine(db, r.id);
}

export function updateRoutine(db: SqliteDb, id: string, patch: DbRow) {
  const existing = getRoutine(db, id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...patch,
    updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now(),
  };
  db.prepare(
    `UPDATE routines
        SET name = ?, prompt = ?,
            schedule_kind = ?, schedule_value = ?, schedule_json = ?,
            project_mode = ?, project_id = ?,
            skill_id = ?, agent_id = ?, context_json = ?,
            enabled = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    merged.name,
    merged.prompt,
    merged.scheduleKind,
    merged.scheduleValue,
    merged.scheduleJson ?? null,
    merged.projectMode,
    merged.projectId ?? null,
    merged.skillId ?? null,
    merged.agentId ?? null,
    merged.contextJson ?? null,
    merged.enabled ? 1 : 0,
    merged.updatedAt,
    id,
  );
  if (isDaemonDbPostgres()) {
    const snapshot = { ...merged };
    schedulePostgresWrite(async () => {
      await pgCore.pgUpdateRoutine(getPostgresPool(), id, snapshot);
    });
  }
  return getRoutine(db, id);
}

export function deleteRoutine(db: SqliteDb, id: string): boolean {
  const result = db.prepare(`DELETE FROM routines WHERE id = ?`).run(id);
  if (isDaemonDbPostgres()) {
    schedulePostgresWrite(async () => {
      await pgCore.pgDeleteRoutine(getPostgresPool(), id);
    });
  }
  return result.changes > 0;
}

function normalizeRoutine(row: DbRow) {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    scheduleKind: row.scheduleKind,
    scheduleValue: row.scheduleValue,
    scheduleJson: row.scheduleJson ?? null,
    projectMode: row.projectMode,
    projectId: row.projectId ?? null,
    skillId: row.skillId ?? null,
    agentId: row.agentId ?? null,
    contextJson: row.contextJson ?? null,
    enabled: Number(row.enabled) === 1,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

export function listRoutineRuns(db: SqliteDb, routineId: string, limit = 20) {
  return (db
    .prepare(
      `SELECT ${ROUTINE_RUN_COLS}
         FROM routine_runs
        WHERE routine_id = ?
        ORDER BY started_at DESC
        LIMIT ?`,
    )
    .all(routineId, limit) as DbRow[])
    .map(normalizeRoutineRun);
}

export function getLatestRoutineRun(db: SqliteDb, routineId: string) {
  const r = db
    .prepare(
      `SELECT ${ROUTINE_RUN_COLS}
         FROM routine_runs
        WHERE routine_id = ?
        ORDER BY started_at DESC
        LIMIT 1`,
    )
    .get(routineId) as DbRow | undefined;
  return r ? normalizeRoutineRun(r) : null;
}

export function getRoutineRun(db: SqliteDb, id: string) {
  const r = db
    .prepare(`SELECT ${ROUTINE_RUN_COLS} FROM routine_runs WHERE id = ?`)
    .get(id) as DbRow | undefined;
  return r ? normalizeRoutineRun(r) : null;
}

export function insertRoutineRun(db: SqliteDb, r: DbRow) {
  db.prepare(
    `INSERT INTO routine_runs
       (id, routine_id, trigger, status, project_id, conversation_id,
        agent_run_id, started_at, completed_at, summary, error, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    r.id,
    r.routineId,
    r.trigger,
    r.status,
    r.projectId,
    r.conversationId,
    r.agentRunId,
    r.startedAt,
    r.completedAt ?? null,
    r.summary ?? null,
    r.error ?? null,
    r.errorCode ?? null,
  );
  if (isDaemonDbPostgres()) {
    const snapshot = { ...r };
    schedulePostgresWrite(async () => {
      await pgCore.pgInsertRoutineRun(getPostgresPool(), snapshot);
    });
  }
  return getRoutineRun(db, r.id);
}

function claimScheduledRoutineRunInSqlite(
  db: SqliteDb,
  r: DbRow,
  slotAt: number,
): boolean {
  const insertClaim = db.prepare(
    `INSERT OR IGNORE INTO routine_schedule_claims
       (routine_id, slot_at, claimed_at)
     VALUES (?, ?, ?)`,
  );
  const insertRun = db.prepare(
    `INSERT INTO routine_runs
       (id, routine_id, trigger, status, project_id, conversation_id,
        agent_run_id, started_at, completed_at, summary, error, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction(() => {
    const claim = insertClaim.run(r.routineId, slotAt, Date.now());
    if (claim.changes === 0) return false;
    insertRun.run(
      r.id,
      r.routineId,
      r.trigger,
      r.status,
      r.projectId,
      r.conversationId,
      r.agentRunId,
      r.startedAt,
      r.completedAt ?? null,
      r.summary ?? null,
      r.error ?? null,
      r.errorCode ?? null,
    );
    return true;
  });
  return tx();
}

/**
 * Sync entrypoint for sqlite-only mode and legacy callers. Claims a scheduler
 * slot in sqlite (single-node atomic) and, when postgres is enabled, also
 * schedules an async pg claim. For multi-node exactly-once scheduling,
 * prefer `tryClaimScheduledRoutineRunAsync`.
 */
export function insertScheduledRoutineRun(db: SqliteDb, r: DbRow, slotAt: number) {
  if (!claimScheduledRoutineRunInSqlite(db, r, slotAt)) return null;
  if (isDaemonDbPostgres()) {
    const snapshot = { ...r };
    schedulePostgresWrite(async () => {
      await pgCore.pgTryClaimScheduledRoutineRun(getPostgresPool(), snapshot, slotAt);
    });
  }
  return getRoutineRun(db, r.id);
}

/**
 * Cross-node atomic scheduler claim. Postgres owns (routine_id, slot_at)
 * uniqueness; sqlite is mirrored best-effort for local sync readers.
 */
export async function tryClaimScheduledRoutineRunAsync(
  db: SqliteDb,
  r: DbRow,
  slotAt: number,
): Promise<DbRow | null> {
  if (isDaemonDbPostgres()) {
    const ok = await pgCore.pgTryClaimScheduledRoutineRun(getPostgresPool(), r, slotAt);
    if (!ok) return null;
    try {
      claimScheduledRoutineRunInSqlite(db, r, slotAt);
    } catch {
      // sqlite mirror best-effort — postgres remains the SSOT for the claim.
    }
    const local = getRoutineRun(db, r.id);
    if (local) return local as DbRow;
    // PG claim succeeded but local sqlite mirror missed (orphan claim row).
    // Return a synthetic row so RoutineService still runs the slot owner.
    return normalizeRoutineRun({
      id: r.id,
      routineId: r.routineId,
      trigger: r.trigger,
      status: r.status,
      projectId: r.projectId,
      conversationId: r.conversationId,
      agentRunId: r.agentRunId,
      startedAt: r.startedAt,
      completedAt: r.completedAt ?? null,
      summary: r.summary ?? null,
      error: r.error ?? null,
      errorCode: r.errorCode ?? null,
    }) as DbRow;
  }
  return insertScheduledRoutineRun(db, r, slotAt);
}

function messageRowForPgUpsert(messageId: string, merged: DbRow, events: DbRow[]): DbRow {
  return {
    id: messageId,
    role: merged.role,
    content: merged.content,
    agentId: merged.agentId,
    agentName: merged.agentName,
    runId: merged.runId,
    runStatus: merged.runStatus,
    lastRunEventId: merged.lastRunEventId,
    events,
    attachments: merged.attachments,
    commentAttachments: merged.commentAttachments,
    producedFiles: merged.producedFiles,
    feedback: merged.feedback,
    preTurnFileNames: merged.preTurnFileNames,
    sessionMode: merged.sessionMode,
    runContext: merged.runContext,
    appliedPluginSnapshot: merged.appliedPluginSnapshot,
    startedAt: merged.startedAt,
    endedAt: merged.endedAt,
  };
}

export function updateRoutineRun(db: SqliteDb, id: string, patch: DbRow) {
  const existing = getRoutineRun(db, id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...patch,
  };
  db.prepare(
    `UPDATE routine_runs
        SET status = ?, project_id = ?, conversation_id = ?, agent_run_id = ?,
            completed_at = ?, summary = ?, error = ?, error_code = ?
      WHERE id = ?`,
  ).run(
    merged.status,
    merged.projectId,
    merged.conversationId,
    merged.agentRunId,
    merged.completedAt ?? null,
    merged.summary ?? null,
    merged.error ?? null,
    merged.errorCode ?? null,
    id,
  );
  if (isDaemonDbPostgres()) {
    const snapshot = { ...merged };
    schedulePostgresWrite(async () => {
      await pgCore.pgUpdateRoutineRun(getPostgresPool(), id, snapshot);
    });
  }
  return getRoutineRun(db, id);
}

function normalizeRoutineRun(row: DbRow) {
  return {
    id: row.id,
    routineId: row.routineId,
    trigger: row.trigger,
    status: row.status,
    projectId: row.projectId,
    conversationId: row.conversationId,
    agentRunId: row.agentRunId,
    startedAt: Number(row.startedAt),
    completedAt: row.completedAt == null ? null : Number(row.completedAt),
    summary: row.summary ?? null,
    error: row.error ?? null,
    errorCode: row.errorCode ?? null,
  };
}

// ---------- tabs ----------

function normalizeBrowserWorkspaceTab(value: unknown): ProjectBrowserWorkspaceTab | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  if (typeof record.label !== 'string' || !record.label.trim()) return null;
  const tab: ProjectBrowserWorkspaceTab = {
    id: record.id,
    label: record.label,
  };
  if (record.insertAfter === null) tab.insertAfter = null;
  else if (typeof record.insertAfter === 'string') tab.insertAfter = record.insertAfter;
  if (typeof record.title === 'string' && record.title.trim()) tab.title = record.title;
  if (typeof record.url === 'string' && record.url.trim()) tab.url = record.url;
  if (typeof record.iconUrl === 'string' && record.iconUrl.trim()) tab.iconUrl = record.iconUrl;
  return tab;
}

function normalizeProjectTabsState(value: unknown): ProjectTabsState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.tabs) || !record.tabs.every((tab) => typeof tab === 'string')) {
    return null;
  }
  const browserTabs = Array.isArray(record.browserTabs)
    ? record.browserTabs
        .map(normalizeBrowserWorkspaceTab)
        .filter((tab): tab is ProjectBrowserWorkspaceTab => Boolean(tab))
    : [];
  const state: ProjectTabsState = {
    tabs: record.tabs.slice(),
    active: typeof record.active === 'string' ? record.active : null,
  };
  if (browserTabs.length > 0) state.browserTabs = browserTabs;
  return state;
}

function parseProjectTabsStateJson(value: unknown): ProjectTabsState | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return normalizeProjectTabsState(JSON.parse(value));
  } catch {
    return null;
  }
}

export function listTabs(db: SqliteDb, projectId: string) {
  if (isDaemonDbPostgres()) {
    const cached = getCachedTabsState(projectId);
    const savedState = parseProjectTabsStateJson(cached?.stateJson);
    if (savedState) {
      return {
        ...savedState,
        hasSavedState: true,
        updatedAt: cached?.updatedAt ?? Date.now(),
      };
    }
    return {
      tabs: [] as string[],
      active: null as string | null,
      hasSavedState: false,
      updatedAt: cached?.updatedAt,
    };
  }
  const rows = db
    .prepare(
      `SELECT name, position, is_active AS isActive
         FROM tabs WHERE project_id = ? ORDER BY position ASC`,
    )
    .all(projectId) as DbRow[];
  const state = db
    .prepare(`SELECT project_id, updated_at AS updatedAt, state_json AS stateJson FROM tabs_state WHERE project_id = ? LIMIT 1`)
    .get(projectId) as DbRow | undefined;
  const savedState = parseProjectTabsStateJson(state?.stateJson);
  if (savedState) {
    return {
      ...savedState,
      hasSavedState: true,
      updatedAt: Number(state?.updatedAt ?? Date.now()),
    };
  }
  const active = (rows as DbRow[]).find((r: DbRow) => r.isActive) ?? null;
  return {
    tabs: (rows as DbRow[]).map((r: DbRow) => r.name),
    active: active ? active.name : null,
    hasSavedState: rows.length > 0 || Boolean(state),
    updatedAt: state ? Number(state.updatedAt ?? Date.now()) : undefined,
  };
}

export function setTabs(
  db: SqliteDb,
  projectId: string,
  stateOrNames: ProjectTabsState | string[],
  activeName: string | null = null,
) {
  const state = normalizeProjectTabsState(
    Array.isArray(stateOrNames)
      ? { tabs: stateOrNames, active: activeName }
      : stateOrNames,
  ) ?? { tabs: [], active: null };
  if (isDaemonDbPostgres()) {
    const stateJson = JSON.stringify(state);
    const updatedAt = Date.now();
    setCachedTabsState(projectId, { stateJson, updatedAt });
    schedulePostgresWrite(async () => {
      await pgCore.pgUpsertTabsState(getPostgresPool(), projectId, stateJson, updatedAt);
    });
    return listTabs(db, projectId);
  }
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO tabs_state (project_id, updated_at, state_json)
       VALUES (?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         updated_at = excluded.updated_at,
         state_json = excluded.state_json`,
    ).run(projectId, Date.now(), JSON.stringify(state));
    db.prepare(`DELETE FROM tabs WHERE project_id = ?`).run(projectId);
    const ins = db.prepare(
      `INSERT INTO tabs (project_id, name, position, is_active)
       VALUES (?, ?, ?, ?)`,
    );
    state.tabs.forEach((name: string, i: number) => {
      ins.run(projectId, name, i, name === state.active ? 1 : 0);
    });
  });
  tx();
  return listTabs(db, projectId);
}
