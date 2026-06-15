-- Teamver Design — token usage only

CREATE TABLE IF NOT EXISTS ai_model_token_usages (
  id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  user_id TEXT,
  workspace_id TEXT,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  operation TEXT,
  project_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_token_usages_used_at ON ai_model_token_usages (used_at);
CREATE INDEX IF NOT EXISTS idx_ai_token_usages_workspace_id ON ai_model_token_usages (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_token_usages_project_id ON ai_model_token_usages (project_id);
