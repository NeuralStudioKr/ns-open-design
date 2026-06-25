-- Teamver Design — token usage only

CREATE TABLE IF NOT EXISTS ai_model_token_usages (
  id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER,
  user_id TEXT,
  workspace_id TEXT,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  operation TEXT,
  project_id TEXT,
  run_id TEXT,
  run_status TEXT,
  token_count_source TEXT NOT NULL DEFAULT 'unknown',
  registry_usage_id TEXT,
  billing_status TEXT NOT NULL DEFAULT 'not_attempted',
  credits_committed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_token_usages_used_at ON ai_model_token_usages (used_at);
CREATE INDEX IF NOT EXISTS idx_ai_token_usages_workspace_id ON ai_model_token_usages (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_token_usages_project_id ON ai_model_token_usages (project_id);

ALTER TABLE ai_model_token_usages ADD COLUMN IF NOT EXISTS run_id TEXT;

ALTER TABLE ai_model_token_usages ADD COLUMN IF NOT EXISTS total_tokens INTEGER;
ALTER TABLE ai_model_token_usages ADD COLUMN IF NOT EXISTS run_status TEXT;
ALTER TABLE ai_model_token_usages ADD COLUMN IF NOT EXISTS token_count_source TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE ai_model_token_usages ADD COLUMN IF NOT EXISTS registry_usage_id TEXT;
ALTER TABLE ai_model_token_usages ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'not_attempted';
ALTER TABLE ai_model_token_usages ADD COLUMN IF NOT EXISTS credits_committed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_token_usage_workspace_run
  ON ai_model_token_usages (workspace_id, run_id)
  WHERE run_id IS NOT NULL AND run_id <> '';

CREATE TABLE IF NOT EXISTS design_projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  od_project_id TEXT NOT NULL UNIQUE,
  s3_prefix TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_projects_workspace
  ON design_projects (workspace_id, updated_at DESC);
