// Track B5 — Postgres DaemonDb schema (core multi-node tables).
// Versioned via daemon_db_schema_migrations. Each migration is idempotent
// (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS) and applied in
// order by migratePostgresDaemonSchema.
//
// v1 — B5.1 core: projects, conversations, agent_sessions, messages
// v2 — B5.2 tabs:  project_tabs_state (single json blob per project)
// v3 — B5.3 preview_comments (per-conversation anchored annotations)
// v4 — B5.4 deployments (per-project preview/publish records)

export const DAEMON_DB_SCHEMA_VERSION = 4;

export const DAEMON_DB_POSTGRES_MIGRATION_V1 = `
CREATE TABLE IF NOT EXISTS daemon_db_schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id                         TEXT PRIMARY KEY,
  name                       TEXT NOT NULL,
  skill_id                   TEXT,
  design_system_id           TEXT,
  pending_prompt             TEXT,
  metadata_json              TEXT,
  applied_plugin_snapshot_id TEXT,
  custom_instructions        TEXT,
  created_at                 BIGINT NOT NULL,
  updated_at                 BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id                         TEXT PRIMARY KEY,
  project_id                 TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title                      TEXT,
  session_mode               TEXT NOT NULL DEFAULT 'design',
  applied_plugin_snapshot_id TEXT,
  created_at                 BIGINT NOT NULL,
  updated_at                 BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conv_project
  ON conversations(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_sessions (
  conversation_id    TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id           TEXT NOT NULL,
  session_id         TEXT NOT NULL,
  stable_prompt_hash TEXT,
  updated_at         BIGINT NOT NULL,
  PRIMARY KEY (conversation_id, agent_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id                            TEXT PRIMARY KEY,
  conversation_id               TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role                          TEXT NOT NULL,
  content                       TEXT NOT NULL,
  agent_id                      TEXT,
  agent_name                    TEXT,
  run_id                        TEXT,
  run_status                    TEXT,
  last_run_event_id             TEXT,
  events_json                   TEXT,
  attachments_json              TEXT,
  comment_attachments_json      TEXT,
  produced_files_json           TEXT,
  feedback_json                 TEXT,
  pre_turn_file_names_json      TEXT,
  session_mode                  TEXT,
  run_context_json              TEXT,
  applied_plugin_snapshot_json  TEXT,
  telemetry_finalized_at        BIGINT,
  started_at                    BIGINT,
  ended_at                      BIGINT,
  position                      INTEGER NOT NULL,
  created_at                    BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conv
  ON messages(conversation_id, position);
`;

export const DAEMON_DB_POSTGRES_MIGRATION_V2 = `
CREATE TABLE IF NOT EXISTS project_tabs_state (
  project_id  TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  state_json  TEXT,
  updated_at  BIGINT NOT NULL
);
`;

// preview_comments — per (project_id, conversation_id, file_path, element_id,
// slide_key) uniqueness matches sqlite. slide_key defaults to -1 so element
// annotations that aren't slide-anchored still satisfy the unique index.
export const DAEMON_DB_POSTGRES_MIGRATION_V3 = `
CREATE TABLE IF NOT EXISTS preview_comments (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  conversation_id     TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  file_path           TEXT NOT NULL,
  element_id          TEXT NOT NULL,
  selector            TEXT NOT NULL,
  label               TEXT NOT NULL,
  text                TEXT NOT NULL,
  position_json       TEXT NOT NULL,
  html_hint           TEXT NOT NULL,
  selection_kind      TEXT,
  member_count        INTEGER,
  pod_members_json    TEXT,
  style_json          TEXT,
  attachments_json    TEXT,
  slide_index         INTEGER,
  slide_key           INTEGER NOT NULL DEFAULT -1,
  note                TEXT NOT NULL,
  status              TEXT NOT NULL,
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL,
  CONSTRAINT preview_comments_scope_unique
    UNIQUE (project_id, conversation_id, file_path, element_id, slide_key)
);

CREATE INDEX IF NOT EXISTS idx_preview_comments_conversation
  ON preview_comments(project_id, conversation_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_preview_comments_conversation_created
  ON preview_comments(project_id, conversation_id, created_at ASC);
`;

// deployments — matches sqlite. UNIQUE(project_id, file_name, provider_id)
// is the upsert scope; a separate id column is preserved so external
// references (e.g. dashboards) remain stable across re-publishes.
export const DAEMON_DB_POSTGRES_MIGRATION_V4 = `
CREATE TABLE IF NOT EXISTS deployments (
  id                      TEXT PRIMARY KEY,
  project_id              TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name               TEXT NOT NULL,
  provider_id             TEXT NOT NULL,
  url                     TEXT NOT NULL,
  deployment_id           TEXT,
  deployment_count        INTEGER NOT NULL DEFAULT 1,
  target                  TEXT NOT NULL DEFAULT 'preview',
  status                  TEXT NOT NULL DEFAULT 'ready',
  status_message          TEXT,
  reachable_at            BIGINT,
  provider_metadata_json  TEXT,
  created_at              BIGINT NOT NULL,
  updated_at              BIGINT NOT NULL,
  CONSTRAINT deployments_scope_unique
    UNIQUE (project_id, file_name, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_deployments_project
  ON deployments(project_id, updated_at DESC);
`;

export const DAEMON_DB_POSTGRES_MIGRATIONS: ReadonlyArray<{
  version: number;
  sql: string;
}> = [
  { version: 1, sql: DAEMON_DB_POSTGRES_MIGRATION_V1 },
  { version: 2, sql: DAEMON_DB_POSTGRES_MIGRATION_V2 },
  { version: 3, sql: DAEMON_DB_POSTGRES_MIGRATION_V3 },
  { version: 4, sql: DAEMON_DB_POSTGRES_MIGRATION_V4 },
];
