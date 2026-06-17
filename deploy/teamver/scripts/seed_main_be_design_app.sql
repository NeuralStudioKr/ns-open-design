-- Idempotent Main BE ai_app row for Teamver Design.
-- Registry app_id: ai-design (Admin UI) · internal bootstrap app_key: design
--
-- Usage (Main BE Postgres, staging example):
--   psql "$MAIN_BE_DATABASE_URL" -f deploy/teamver/scripts/seed_main_be_design_app.sql
--
-- Ops: only required when globally disabling design via ai_app.is_active=false.
-- Without a row, bootstrap treats design as enabled (see app_bootstrap_service.py).
--
-- psql variables (set by seed_main_be_design_app.sh):
--   frontend_url, backend_url

INSERT INTO public.ai_app (
  id,
  name,
  description,
  display_name,
  short_description,
  category,
  is_active,
  launch_status,
  frontend_url,
  backend_url,
  sort_order,
  is_featured
) VALUES (
  'ai-design',
  'design',
  'Teamver AI Design — Open Design embed (design.teamver.com)',
  'AI Design',
  'Design with AI in your workspace',
  'productivity',
  TRUE,
  'live',
  :'frontend_url',
  :'backend_url',
  520,
  FALSE
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  display_name = EXCLUDED.display_name,
  short_description = EXCLUDED.short_description,
  category = EXCLUDED.category,
  launch_status = EXCLUDED.launch_status,
  frontend_url = EXCLUDED.frontend_url,
  backend_url = EXCLUDED.backend_url,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
