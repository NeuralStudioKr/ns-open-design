-- Idempotent Main BE ai_app row for Teamver Design (AppKey.DESIGN / bootstrap app_key=design).
--
-- Usage (Main BE Postgres, staging example):
--   psql "$MAIN_BE_DATABASE_URL" -f deploy/teamver/scripts/seed_main_be_design_app.sql
--
-- Ops: only required when globally disabling design via ai_app.is_active=false.
-- Without a row, bootstrap treats design as enabled (see app_bootstrap_service.py).

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
  'design',
  'design',
  'Teamver AI Design — Open Design embed (design.teamver.com)',
  'AI Design',
  'Design with AI in your workspace',
  'productivity',
  TRUE,
  'live',
  'https://stg-design.teamver.com',
  'https://stg-design-api.teamver.com',
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

-- Production URLs (run manually or duplicate with prod hosts):
-- frontend_url = 'https://design.teamver.com'
-- backend_url  = 'https://design-api.teamver.com'
