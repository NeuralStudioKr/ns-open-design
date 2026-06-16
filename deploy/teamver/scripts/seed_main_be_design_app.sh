#!/usr/bin/env bash
# Apply Main BE ai_app row for Teamver Design (A8).
#
# Usage:
#   MAIN_BE_DATABASE_URL='postgresql://user:pass@host:5432/teamver' \
#     bash scripts/seed_main_be_design_app.sh
#
# Staging/production URLs are in the SQL file comments — edit before prod apply if needed.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="$ROOT/scripts/seed_main_be_design_app.sql"

if [[ -z "${MAIN_BE_DATABASE_URL:-}" ]]; then
  echo "❌ MAIN_BE_DATABASE_URL required (Main BE Postgres connection string)"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "❌ psql not found"
  exit 1
fi

echo "==> Applying $SQL_FILE"
psql "$MAIN_BE_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
echo "✓ ai_app design row upserted"
