#!/usr/bin/env bash
# Apply Main BE ai_app row for Teamver Design (A8).
#
# Usage:
#   MAIN_BE_DATABASE_URL='postgresql://user:pass@host:5432/teamver' \
#     bash scripts/seed_main_be_design_app.sh --staging
#   MAIN_BE_DATABASE_URL='...' bash scripts/seed_main_be_design_app.sh --production
#
# Override URLs:
#   FRONTEND_URL='https://design.teamver.com' BACKEND_URL='https://design-api.teamver.com' \
#     bash scripts/seed_main_be_design_app.sh --production
#
# Verify existing row (no write):
#   MAIN_BE_DATABASE_URL='...' bash scripts/seed_main_be_design_app.sh --verify-only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="$ROOT/scripts/seed_main_be_design_app.sql"
ENV_MODE=""
VERIFY_ONLY=0

while (( $# )); do
  case "$1" in
    --staging) ENV_MODE=staging ;;
    --production) ENV_MODE=production ;;
    --verify-only) VERIFY_ONLY=1 ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
  shift
done

if [[ -z "${MAIN_BE_DATABASE_URL:-}" ]]; then
  echo "❌ MAIN_BE_DATABASE_URL required (Main BE Postgres connection string)"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "❌ psql not found"
  exit 1
fi

FRONTEND_URL="${FRONTEND_URL:-}"
BACKEND_URL="${BACKEND_URL:-}"

case "$ENV_MODE" in
  staging)
    FRONTEND_URL="${FRONTEND_URL:-https://stg-design.teamver.com}"
    BACKEND_URL="${BACKEND_URL:-https://stg-design-api.teamver.com}"
    ;;
  production)
    FRONTEND_URL="${FRONTEND_URL:-https://design.teamver.com}"
    BACKEND_URL="${BACKEND_URL:-https://design-api.teamver.com}"
    ;;
  "")
    FRONTEND_URL="${FRONTEND_URL:-https://stg-design.teamver.com}"
    BACKEND_URL="${BACKEND_URL:-https://stg-design-api.teamver.com}"
    echo "○ no --staging/--production — defaulting to staging URLs"
    ;;
esac

if [[ "$VERIFY_ONLY" -eq 1 ]]; then
  echo "==> Verifying Main BE ai_app row (ai-design)"
  row="$(psql "$MAIN_BE_DATABASE_URL" -v ON_ERROR_STOP=1 -tA -c \
    "SELECT id || '|' || COALESCE(is_active::text,'') || '|' || COALESCE(frontend_url,'') || '|' || COALESCE(backend_url,'') || '|' || COALESCE(launch_status,'') FROM public.ai_app WHERE id = 'ai-design';")"
  if [[ -z "${row// }" ]]; then
    echo "✗ ai_app id=ai-design not found — run without --verify-only to seed"
    exit 1
  fi
  IFS='|' read -r app_id is_active fe_url be_url launch_status <<< "$row"
  echo "  ✓ id=$app_id is_active=$is_active launch_status=$launch_status"
  echo "    frontend_url=$fe_url"
  echo "    backend_url=$be_url"
  if [[ "$ENV_MODE" == "staging" || "$ENV_MODE" == "production" ]]; then
    expected_fe="${FRONTEND_URL}"
    expected_be="${BACKEND_URL}"
    if [[ "$fe_url" != "$expected_fe" || "$be_url" != "$expected_be" ]]; then
      echo "○ URL mismatch vs --$ENV_MODE defaults (expected fe=$expected_fe be=$expected_be)"
    else
      echo "  ✓ URLs match --$ENV_MODE defaults"
    fi
  fi
  exit 0
fi

echo "==> Applying $SQL_FILE"
echo "    frontend_url=$FRONTEND_URL"
echo "    backend_url=$BACKEND_URL"
psql "$MAIN_BE_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v frontend_url="$FRONTEND_URL" \
  -v backend_url="$BACKEND_URL" \
  -f "$SQL_FILE"
echo "✓ ai_app ai-design row upserted (bootstrap app_key=design)"
