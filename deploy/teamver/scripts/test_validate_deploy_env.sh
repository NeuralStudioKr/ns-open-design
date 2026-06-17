#!/usr/bin/env bash
# Smoke test for validate_deploy_env.sh using a temporary env file (no secrets).
#
# Usage: bash deploy/teamver/scripts/test_validate_deploy_env.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/validate_deploy_env.sh"
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

# Exercise the real script via --env-file path.
clean_out="$(bash "$SCRIPT" --staging --rds --env-file "$TMP_ENV" 2>&1)"
if ! grep -q 'preflight OK' <<< "$clean_out"; then
  echo "❌ baseline fixture should pass preflight"
  echo "$clean_out"
  exit 1
fi
if ! grep -q 'TEAMVER_REGISTRY_\* 미설정' <<< "$clean_out"; then
  echo "❌ expected REGISTRY 미설정 warning in baseline"
  echo "$clean_out"
  exit 1
fi

# Partial registry creds → must fail.
PARTIAL_ENV="$(mktemp)"
cat "$TMP_ENV" > "$PARTIAL_ENV"
echo 'TEAMVER_REGISTRY_APP_ID=ai-design' >> "$PARTIAL_ENV"
if bash "$SCRIPT" --staging --rds --env-file "$PARTIAL_ENV" >/dev/null 2>&1; then
  echo "❌ partial TEAMVER_REGISTRY_* must fail preflight"
  rm -f "$PARTIAL_ENV"
  exit 1
fi
rm -f "$PARTIAL_ENV"

# Full registry creds → warns but passes.
FULL_ENV="$(mktemp)"
cat "$TMP_ENV" > "$FULL_ENV"
{
  echo 'TEAMVER_REGISTRY_APP_ID=ai-design'
  echo 'TEAMVER_REGISTRY_KEY_ID=key-1'
  echo 'TEAMVER_REGISTRY_ACCESS_KEY=secret-1'
} >> "$FULL_ENV"
full_out="$(bash "$SCRIPT" --staging --rds --env-file "$FULL_ENV" 2>&1)"
if ! grep -q 'TEAMVER_REGISTRY_\* 설정됨' <<< "$full_out"; then
  echo "❌ expected REGISTRY 설정됨 warning"
  rm -f "$FULL_ENV"
  echo "$full_out"
  exit 1
fi
rm -f "$FULL_ENV"

echo "✓ validate_deploy_env --env-file + REGISTRY warnings ok"
echo "  (full script requires .env.staging on disk — run on EC2 after cp .env.staging.example)"

# Drive publish folder warn lines.
if ! grep -q 'TEAMVER_DRIVE_PUBLISH_FOLDER_ID 미설정' <<< "$clean_out"; then
  echo "❌ baseline should warn about TEAMVER_DRIVE_PUBLISH_FOLDER_ID 미설정"
  echo "$clean_out"
  exit 1
fi

DRIVE_ENV="$(mktemp)"
cat "$TMP_ENV" > "$DRIVE_ENV"
echo 'TEAMVER_DRIVE_PUBLISH_FOLDER_ID=drive-folder-123' >> "$DRIVE_ENV"
drive_out="$(bash "$SCRIPT" --staging --rds --env-file "$DRIVE_ENV" 2>&1)"
if ! grep -q 'TEAMVER_DRIVE_PUBLISH_FOLDER_ID 설정됨' <<< "$drive_out"; then
  echo "❌ expected DRIVE_PUBLISH_FOLDER_ID 설정됨 warning"
  rm -f "$DRIVE_ENV"
  echo "$drive_out"
  exit 1
fi
rm -f "$DRIVE_ENV"

# Scratch eviction + sync-up metrics warn lines (s3 mode).
if ! grep -q 'OD_SCRATCH_EVICT_AFTER_RUN 미설정' <<< "$clean_out"; then
  echo "❌ baseline should warn about OD_SCRATCH_EVICT_AFTER_RUN 미설정"
  echo "$clean_out"
  exit 1
fi
if ! grep -q 'OD_S3_SYNC_UP_METRICS!=1' <<< "$clean_out"; then
  echo "❌ baseline should warn about OD_S3_SYNC_UP_METRICS!=1"
  echo "$clean_out"
  exit 1
fi
if ! grep -q 'OD_SCRATCH_DISK_METRICS!=1' <<< "$clean_out"; then
  echo "❌ baseline should warn about OD_SCRATCH_DISK_METRICS!=1"
  echo "$clean_out"
  exit 1
fi

echo "✓ validate_deploy_env DRIVE/SCRATCH/SYNC-UP warnings ok"

# Daemon billing bridge warnings.
if ! grep -q 'daemon billing bridge 활성\|daemon billing bridge OFF' <<< "$clean_out"; then
  echo "❌ baseline should print daemon billing bridge line (활성 or OFF)"
  echo "$clean_out"
  exit 1
fi

BILL_OFF_ENV="$(mktemp)"
cat "$TMP_ENV" > "$BILL_OFF_ENV"
echo 'TEAMVER_BILLING_DISABLED=1' >> "$BILL_OFF_ENV"
billoff_out="$(bash "$SCRIPT" --staging --rds --env-file "$BILL_OFF_ENV" 2>&1)"
if ! grep -q 'TEAMVER_BILLING_DISABLED=1' <<< "$billoff_out"; then
  echo "❌ TEAMVER_BILLING_DISABLED=1 warning missing"
  rm -f "$BILL_OFF_ENV"
  echo "$billoff_out"
  exit 1
fi
rm -f "$BILL_OFF_ENV"

echo "✓ validate_deploy_env daemon billing bridge warnings ok"
