// Track B5 — Postgres DaemonDb schema (core multi-node tables).
// Versioned via daemon_db_schema_migrations. Each migration is idempotent
// (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS) and applied in
// order by migratePostgresDaemonSchema.
//
// v1 — B5.1 core: projects, conversations, agent_sessions, messages
// v2 — B5.2 tabs:  project_tabs_state (single json blob per project)
// v3 — B5.3 preview_comments (per-conversation anchored annotations)
// v4 — B5.4 deployments (per-project preview/publish records)
// v5 — B5.5 routines / routine_runs / routine_schedule_claims
// v6 — B5.6 installed_plugins / plugin_marketplaces / applied_plugin_snapshots

export const DAEMON_DB_SCHEMA_VERSION = 6;

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

// routines — scheduler config (system-scoped, no project FK because project_id
// is nullable; the sqlite table has no FK either).
// routine_runs — per-invocation log.
// routine_schedule_claims — leader-election claim ((routine_id, slot_at) PK).
// The PK plus INSERT … ON CONFLICT DO NOTHING gives atomic exactly-once
// scheduling across multiple daemon nodes, which the sqlite path can't do.
export const DAEMON_DB_POSTGRES_MIGRATION_V5 = `
CREATE TABLE IF NOT EXISTS routines (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  prompt           TEXT NOT NULL,
  schedule_kind    TEXT NOT NULL,
  schedule_value   TEXT NOT NULL,
  schedule_json    TEXT,
  project_mode     TEXT NOT NULL,
  project_id       TEXT,
  skill_id         TEXT,
  agent_id         TEXT,
  context_json     TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_runs (
  id               TEXT PRIMARY KEY,
  routine_id       TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  trigger          TEXT NOT NULL,
  status           TEXT NOT NULL,
  project_id       TEXT NOT NULL,
  conversation_id  TEXT NOT NULL,
  agent_run_id     TEXT NOT NULL,
  started_at       BIGINT NOT NULL,
  completed_at     BIGINT,
  summary          TEXT,
  error            TEXT,
  error_code       TEXT
);

CREATE INDEX IF NOT EXISTS idx_routine_runs_routine
  ON routine_runs(routine_id, started_at DESC);

CREATE TABLE IF NOT EXISTS routine_schedule_claims (
  routine_id  TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  slot_at     BIGINT NOT NULL,
  claimed_at  BIGINT NOT NULL,
  PRIMARY KEY (routine_id, slot_at)
);
`;

// installed_plugins / plugin_marketplaces / applied_plugin_snapshots — the
// v6 slice mirrors the sqlite schema shipped in plugins/persistence.ts. We
// intentionally exclude run_devloop_iterations, genui_surfaces, and
// skill_plugin_candidates for now: they either target in-memory runs or
// candidate caches that don't need cross-node consistency yet.
export const DAEMON_DB_POSTGRES_MIGRATION_V6 = `
CREATE TABLE IF NOT EXISTS installed_plugins (
  id                                TEXT PRIMARY KEY,
  title                             TEXT NOT NULL,
  version                           TEXT NOT NULL,
  source_kind                       TEXT NOT NULL,
  source                            TEXT NOT NULL,
  pinned_ref                        TEXT,
  source_digest                     TEXT,
  source_marketplace_id             TEXT,
  source_marketplace_entry_name     TEXT,
  source_marketplace_entry_version  TEXT,
  marketplace_trust                 TEXT,
  resolved_source                   TEXT,
  resolved_ref                      TEXT,
  manifest_digest                   TEXT,
  archive_integrity                 TEXT,
  trust                             TEXT NOT NULL,
  capabilities_granted              TEXT NOT NULL,
  manifest_json                     TEXT NOT NULL,
  fs_path                           TEXT NOT NULL,
  installed_at                      BIGINT NOT NULL,
  updated_at                        BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_installed_plugins_source_kind
  ON installed_plugins(source_kind);

CREATE TABLE IF NOT EXISTS plugin_marketplaces (
  id             TEXT PRIMARY KEY,
  url            TEXT NOT NULL,
  spec_version   TEXT NOT NULL DEFAULT '1.0.0',
  version        TEXT NOT NULL DEFAULT '0.0.0',
  trust          TEXT NOT NULL,
  manifest_json  TEXT NOT NULL,
  added_at       BIGINT NOT NULL,
  refreshed_at   BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketplaces_version
  ON plugin_marketplaces(version);

CREATE TABLE IF NOT EXISTS applied_plugin_snapshots (
  id                                TEXT PRIMARY KEY,
  project_id                        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  conversation_id                   TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  run_id                            TEXT,
  plugin_id                         TEXT NOT NULL,
  plugin_spec_version               TEXT NOT NULL DEFAULT '1.0.0',
  plugin_version                    TEXT NOT NULL,
  manifest_source_digest            TEXT NOT NULL,
  source_marketplace_id             TEXT,
  source_marketplace_entry_name     TEXT,
  source_marketplace_entry_version  TEXT,
  marketplace_trust                 TEXT,
  resolved_source                   TEXT,
  resolved_ref                      TEXT,
  archive_integrity                 TEXT,
  pinned_ref                        TEXT,
  task_kind                         TEXT NOT NULL,
  inputs_json                       TEXT NOT NULL,
  resolved_context_json             TEXT NOT NULL,
  craft_requires_json               TEXT NOT NULL DEFAULT '[]',
  pipeline_json                     TEXT,
  genui_surfaces_json               TEXT NOT NULL DEFAULT '[]',
  capabilities_granted              TEXT NOT NULL,
  capabilities_required             TEXT NOT NULL DEFAULT '[]',
  assets_staged_json                TEXT NOT NULL,
  connectors_required_json          TEXT NOT NULL DEFAULT '[]',
  connectors_resolved_json          TEXT NOT NULL DEFAULT '[]',
  mcp_servers_json                  TEXT NOT NULL DEFAULT '[]',
  plugin_title                      TEXT,
  plugin_description                TEXT,
  query_text                        TEXT,
  status                            TEXT NOT NULL DEFAULT 'fresh',
  applied_at                        BIGINT NOT NULL,
  expires_at                        BIGINT
);

CREATE INDEX IF NOT EXISTS idx_snapshots_project ON applied_plugin_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_run     ON applied_plugin_snapshots(run_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_plugin  ON applied_plugin_snapshots(plugin_id, plugin_version);
`;

export const DAEMON_DB_POSTGRES_MIGRATIONS: ReadonlyArray<{
  version: number;
  sql: string;
}> = [
  { version: 1, sql: DAEMON_DB_POSTGRES_MIGRATION_V1 },
  { version: 2, sql: DAEMON_DB_POSTGRES_MIGRATION_V2 },
  { version: 3, sql: DAEMON_DB_POSTGRES_MIGRATION_V3 },
  { version: 4, sql: DAEMON_DB_POSTGRES_MIGRATION_V4 },
  { version: 5, sql: DAEMON_DB_POSTGRES_MIGRATION_V5 },
  { version: 6, sql: DAEMON_DB_POSTGRES_MIGRATION_V6 },
];
