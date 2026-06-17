#!/usr/bin/env bash
# Smoke test for validate_deploy_env.sh using a temporary env file (no secrets).
#
# Usage: bash deploy/teamver/scripts/test_validate_deploy_env.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT

cat > "$TMP_ENV" <<'EOF'
ENV=staging
OD_API_TOKEN=test-token
TEAMVER_JWT_SECRET=test-jwt-secret
TEAMVER_INTERNAL_API_KEY=test-internal-key
TEAMVER_API_BASE_URL=https://stg-api.teamver.com
POSTGRES_HOST=teamver-design-staging-postgres.example.rds.amazonaws.com
POSTGRES_PORT=5432
POSTGRES_DB=teamver_design_staging
POSTGRES_USER=teamver_design_admin
POSTGRES_PASSWD=test-db-pass
TEAMVER_DESIGN_API_URL=http://teamver-design-api:8000
OD_PROJECT_STORAGE=s3
OD_S3_BUCKET=teamver-design-staging-data
OD_S3_REGION=ap-northeast-2
TRUST_TEAMVER_PROXY_HEADERS=true
EOF

# validate_deploy_env only reads fixed paths — invoke inline with sourced temp env
# shellcheck disable=SC1090
set -a
source "$TMP_ENV"
set +a

errors=0
fail() { echo "❌ $1"; errors=$((errors + 1)); }
require_nonempty() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value// }" ]]; then
    fail "$name empty"
  fi
}

require_nonempty OD_API_TOKEN
require_nonempty TEAMVER_JWT_SECRET
require_nonempty OD_S3_BUCKET
require_nonempty TEAMVER_DESIGN_API_URL

if [[ "${OD_PROJECT_STORAGE}" != "s3" ]]; then
  fail "expected s3 storage in fixture"
fi

if [[ "$errors" -gt 0 ]]; then
  echo "validate fixture self-check failed"
  exit 1
fi

echo "✓ validate_deploy_env fixture keys ok"
echo "  (full script requires .env.staging on disk — run on EC2 after cp .env.staging.example)"
