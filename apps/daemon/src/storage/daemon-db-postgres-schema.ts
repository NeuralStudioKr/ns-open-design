// Track B5 — Postgres DaemonDb schema (core multi-node tables).
// Versioned via daemon_db_schema_migrations. Full sqlite parity for
// projects / conversations / messages / agent_sessions (B5.1).

export const DAEMON_DB_SCHEMA_VERSION = 1;

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
