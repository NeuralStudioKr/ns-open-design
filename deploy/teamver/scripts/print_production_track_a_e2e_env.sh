#!/usr/bin/env bash
# Print production Track A launch-evidence env template.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE=""

while (( $# )); do
  case "$1" in
    --from-env) shift; ENV_FILE="${1:-}" ;;
    -h|--help) sed -n '2,2p' "$0" | sed 's/^# //'; exit 0 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
  shift
done

postgres_host="${POSTGRES_HOST:-teamver-production-postgres.example.rds.amazonaws.com}"
postgres_port="${POSTGRES_PORT:-5432}"
postgres_db="${POSTGRES_DB:-teamver_design_production}"
postgres_user="${POSTGRES_USER:-teamver_design_admin}"
internal_key='<from .env.production TEAMVER_INTERNAL_API_KEY>'
s3_bucket="${OD_S3_BUCKET:-teamver-design-production-data}"

if [[ -n "$ENV_FILE" ]]; then
  [[ -f "$ENV_FILE" ]] || { echo "❌ $ENV_FILE not found"; exit 1; }
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  postgres_host="${POSTGRES_HOST:-$postgres_host}"
  postgres_port="${POSTGRES_PORT:-$postgres_port}"
  postgres_db="${POSTGRES_DB:-$postgres_db}"
  postgres_user="${POSTGRES_USER:-$postgres_user}"
  s3_bucket="${OD_S3_BUCKET:-$s3_bucket}"
fi

cat <<EOF
# --- Track A production launch evidence ---
export TEAMVER_COOKIE='teamver_access_token=<production user cookie>'
export TEAMVER_INTERNAL_API_KEY='${internal_key}'
export MAIN_BE_DATABASE_URL='postgresql://${postgres_user}:<password>@${postgres_host}:${postgres_port}/${postgres_db}?sslmode=require'
export TEAMVER_OD_PROJECT_ID='<production OD project id>'
export TEAMVER_S3_BUCKET='${s3_bucket}'

# Required for the real Drive import happy-path probe:
export TEAMVER_DRIVE_IMPORT_ASSET_ID='<production Drive asset id>'
export TEAMVER_DRIVE_IMPORT_FILENAME='e2e-import.txt'

# Drive BFF (D-B1/D-B2/D-B3) — cookie + session workspace 필요.

# Optional cross-user isolation evidence:
# export TEAMVER_COOKIE_USER_B='teamver_access_token=<second production user cookie>'

# Run only after smoke/storage isolation pass:
#   bash scripts/run_post_deploy_track_a.sh --production --rds --smoke --e2e-strict
EOF
