#!/usr/bin/env bash
# Print Track A staging E2E env template (curl + RDS probes).
#
# Usage:
#   bash scripts/print_staging_track_a_e2e_env.sh
#   bash scripts/print_staging_track_a_e2e_env.sh --from-env .env.staging
#
# Does not print secrets from git-tracked files — placeholders only.
# On EC2, copy TEAMVER_COOKIE from browser after login to stg-design.teamver.com.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE=""

while (( $# )); do
  case "$1" in
    --from-env)
      shift
      ENV_FILE="${1:-}"
      ;;
    -h|--help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
  shift
done

postgres_host="${POSTGRES_HOST:-teamver-staging-postgres.example.rds.amazonaws.com}"
postgres_port="${POSTGRES_PORT:-5432}"
postgres_db="${POSTGRES_DB:-teamver_design_staging}"
postgres_user="${POSTGRES_USER:-teamver_be_admin}"
internal_key="${TEAMVER_INTERNAL_API_KEY:-<from .env.staging TEAMVER_INTERNAL_API_KEY>}"

if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
  postgres_host="${POSTGRES_HOST:-$postgres_host}"
  postgres_port="${POSTGRES_PORT:-5432}"
  postgres_db="${POSTGRES_DB:-$postgres_db}"
  postgres_user="${POSTGRES_USER:-$postgres_user}"
  if [[ -n "${TEAMVER_INTERNAL_API_KEY:-}" ]]; then
    internal_key="${TEAMVER_INTERNAL_API_KEY}"
  fi
fi

cat <<EOF
# --- Track A staging E2E (run_staging_track_a_e2e.sh) ---
# Required for S-8 / D-5 / D-6:
export TEAMVER_COOKIE='teamver_access_token=<paste from browser DevTools → Application → Cookies>'
export TEAMVER_INTERNAL_API_KEY='${internal_key}'

# RDS psql (U-6c row count + D-5b design_outputs) — password 는 EC2 secret vault 에서:
export MAIN_BE_DATABASE_URL='postgresql://${postgres_user}:<password>@${postgres_host}:${postgres_port}/${postgres_db}?sslmode=require'

# design-api project ref (OD project id from /api/v1/projects list):
export TEAMVER_OD_PROJECT_ID='<DPRJ_... or od project id>'

# D-6a only — slide-friendly Drive asset (txt/png/svg). D-6b policy probe 는 asset 불필요.
export TEAMVER_DRIVE_IMPORT_ASSET_ID='<AST-... from Teamver Drive>'

# S-8c (slide/API chat) — cookie 만 있으면 runtime-config configured=true + model 검증.

# Optional:
# export TEAMVER_COOKIE_USER_B='teamver_access_token=<user B>'   # isolation 403
# export TEAMVER_E2E_RUN_PREFIX='e2e-staging-'
# export SKIP_DRIVE=1              # D-5/D-6 전체 skip
# export SKIP_DRIVE_IMPORT_POLICY=1  # D-6b policy probe skip
# export SKIP_DB=1                 # U-6c / D-5b psql skip

# Run (staging EC2 or VPN):
#   cd deploy/teamver
#   bash scripts/run_staging_track_a_e2e.sh --staging
#
# Post-deploy Phase 9:
#   bash scripts/run_post_deploy_track_a.sh --staging --rds --smoke --e2e
EOF
