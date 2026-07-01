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
TEAMVER_INTERNAL_API_KEY=test-internal-key
TEAMVER_API_BASE_URL=https://stg-api.teamver.com
TEAMVER_JWKS_URL=https://stg-api.teamver.com/.well-known/jwks.json
TEAMVER_JWT_ISSUER=https://stg-api.teamver.com
TEAMVER_JWT_AUDIENCE=teamver-design
DESIGN_BFF_SESSION_SECRET=test-bff-secret
DESIGN_PUBLIC_ORIGIN=https://stg-design.teamver.com
TEAMVER_MAIN_LOGIN_URL=https://stg.teamver.com/auth/signin
TEAMVER_BFF_SESSION_ENABLED=true
POSTGRES_HOST=teamver-design-staging-postgres.example.rds.amazonaws.com
POSTGRES_PORT=5432
POSTGRES_DB=teamver_design_staging
POSTGRES_USER=teamver_be_admin
POSTGRES_PASSWD=test-db-pass
TEAMVER_DESIGN_API_URL=http://teamver-design-api:8000
OD_PROJECT_STORAGE=s3
OD_S3_BUCKET=teamver-design-staging-data
OD_S3_PREFIX=design/
OD_S3_REGION=ap-northeast-2
OD_SCRATCH_EVICT_AFTER_RUN=1
OD_S3_SYNC_UP_METRICS=1
OD_SCRATCH_DISK_METRICS=1
OD_SCRATCH_DISK_THRESHOLD_MB=2048
OD_SCRATCH_DISK_METRIC_INTERVAL_MS=300000
OD_S3_PURGE_ON_DELETE=0
LITESTREAM_BUCKET=teamver-design-staging-data
LITESTREAM_REGION=ap-northeast-2
TRUST_TEAMVER_PROXY_HEADERS=true
TEAMVER_OD_API_KEY=test-managed-api-key
TEAMVER_REGISTRY_APP_ID=ai-design
TEAMVER_REGISTRY_KEY_ID=key-1
TEAMVER_REGISTRY_ACCESS_KEY=secret-1
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
require_nonempty TEAMVER_JWKS_URL
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

# Staging embed — TEAMVER_OD_API_KEY 필수.
NOKEY_ENV="$(mktemp)"
grep -v '^TEAMVER_OD_API_KEY=' "$TMP_ENV" > "$NOKEY_ENV" || true
if bash "$SCRIPT" --staging --rds --env-file "$NOKEY_ENV" >/dev/null 2>&1; then
  echo "❌ staging without TEAMVER_OD_API_KEY must fail preflight"
  rm -f "$NOKEY_ENV"
  exit 1
fi
nokey_out="$(bash "$SCRIPT" --staging --rds --env-file "$NOKEY_ENV" 2>&1 || true)"
if ! grep -q 'TEAMVER_OD_API_KEY 필요' <<< "$nokey_out"; then
  echo "❌ expected TEAMVER_OD_API_KEY staging gate message"
  echo "$nokey_out"
  rm -f "$NOKEY_ENV"
  exit 1
fi
rm -f "$NOKEY_ENV"
echo "✓ staging TEAMVER_OD_API_KEY gate ok"

BAD_PREFIX_ENV="$(mktemp)"
sed 's/^OD_S3_PREFIX=design\//OD_S3_PREFIX=design/' "$TMP_ENV" > "$BAD_PREFIX_ENV"
bad_prefix_out="$(bash "$SCRIPT" --staging --rds --env-file "$BAD_PREFIX_ENV" 2>&1 || true)"
if ! grep -q 'OD_S3_PREFIX=design — trailing slash' <<< "$bad_prefix_out"; then
  echo "❌ staging must reject OD_S3_PREFIX without trailing slash"
  echo "$bad_prefix_out"
  rm -f "$BAD_PREFIX_ENV"
  exit 1
fi
rm -f "$BAD_PREFIX_ENV"
echo "✓ validate_deploy_env rejects OD_S3_PREFIX without trailing slash"

if ! grep -q 'TEAMVER_REGISTRY_\* 설정됨' <<< "$clean_out"; then
  echo "❌ expected REGISTRY 설정됨 warning in baseline"
  echo "$clean_out"
  exit 1
fi

# Partial registry creds → must fail.
PARTIAL_ENV="$(mktemp)"
grep -v '^TEAMVER_REGISTRY_' "$TMP_ENV" > "$PARTIAL_ENV"
echo 'TEAMVER_REGISTRY_APP_ID=ai-design' >> "$PARTIAL_ENV"
if bash "$SCRIPT" --staging --rds --env-file "$PARTIAL_ENV" >/dev/null 2>&1; then
  echo "❌ partial TEAMVER_REGISTRY_* must fail preflight"
  rm -f "$PARTIAL_ENV"
  exit 1
fi
rm -f "$PARTIAL_ENV"

# Full registry creds → warns but passes.
FULL_ENV="$(mktemp)"
grep -v '^TEAMVER_REGISTRY_' "$TMP_ENV" > "$FULL_ENV"
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

# Staging may disable billing only through an explicit kill switch.
BILLING_KILL_ENV="$(mktemp)"
grep -v '^TEAMVER_REGISTRY_' "$TMP_ENV" > "$BILLING_KILL_ENV"
echo 'TEAMVER_BILLING_DISABLED=1' >> "$BILLING_KILL_ENV"
if ! bash "$SCRIPT" --staging --rds --env-file "$BILLING_KILL_ENV" >/dev/null 2>&1; then
  echo "❌ staging explicit billing kill switch should allow missing registry creds"
  rm -f "$BILLING_KILL_ENV"
  exit 1
fi
rm -f "$BILLING_KILL_ENV"

# Production — same interim kill switch while Registry Phase 2 is not wired.
PROD_BILLING_DIR="$(mktemp -d)"
grep -v '^TEAMVER_REGISTRY_' "$TMP_ENV" > "$PROD_BILLING_DIR/.env.production"
echo 'TEAMVER_BILLING_DISABLED=1' >> "$PROD_BILLING_DIR/.env.production"
if ! bash "$SCRIPT" --production --rds --env-file "$PROD_BILLING_DIR/.env.production" >/dev/null 2>&1; then
  echo "❌ production explicit billing kill switch should allow missing registry creds"
  rm -rf "$PROD_BILLING_DIR"
  exit 1
fi
prod_no_reg_out="$(bash "$SCRIPT" --production --rds --env-file "$PROD_BILLING_DIR/.env.production" 2>&1)"
if ! grep -q 'TEAMVER_BILLING_DISABLED=1' <<< "$prod_no_reg_out"; then
  echo "❌ production billing kill switch should emit BILLING_DISABLED warning"
  echo "$prod_no_reg_out"
  rm -rf "$PROD_BILLING_DIR"
  exit 1
fi
PROD_NO_KILL_DIR="$(mktemp -d)"
grep -v -E '^(TEAMVER_REGISTRY_|TEAMVER_BILLING_DISABLED)' "$TMP_ENV" > "$PROD_NO_KILL_DIR/.env.production"
if bash "$SCRIPT" --production --rds --env-file "$PROD_NO_KILL_DIR/.env.production" >/dev/null 2>&1; then
  echo "❌ production w/o registry and w/o BILLING_DISABLED must fail"
  rm -rf "$PROD_BILLING_DIR" "$PROD_NO_KILL_DIR"
  exit 1
fi
rm -rf "$PROD_BILLING_DIR" "$PROD_NO_KILL_DIR"

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

# Drive proxy timeout — long must be >= browse (warn only).
TIMEOUT_ENV="$(mktemp)"
cat "$TMP_ENV" > "$TIMEOUT_ENV"
{
  echo 'TEAMVER_HTTP_TIMEOUT_SECONDS=10'
  echo 'TEAMVER_DRIVE_PROXY_LONG_TIMEOUT_SECONDS=5'
} >> "$TIMEOUT_ENV"
timeout_out="$(bash "$SCRIPT" --staging --rds --env-file "$TIMEOUT_ENV" 2>&1)"
if ! grep -q 'thumbnail batch timeout should be >= browse' <<< "$timeout_out"; then
  echo "❌ expected drive proxy long<browse timeout warning"
  rm -f "$TIMEOUT_ENV"
  echo "$timeout_out"
  exit 1
fi
rm -f "$TIMEOUT_ENV"

# Hosted S3 requires scratch capacity and sync failure visibility settings.
for key in OD_SCRATCH_EVICT_AFTER_RUN OD_S3_SYNC_UP_METRICS OD_SCRATCH_DISK_METRICS; do
  MISSING_ENV="$(mktemp)"
  grep -v "^${key}=" "$TMP_ENV" > "$MISSING_ENV" || true
  missing_out="$(bash "$SCRIPT" --staging --rds --env-file "$MISSING_ENV" 2>&1 || true)"
  if ! grep -q "${key}=1 필요" <<< "$missing_out"; then
    echo "❌ hosted S3 without ${key}=1 must fail preflight"
    echo "$missing_out"
    rm -f "$MISSING_ENV"
    exit 1
  fi
  rm -f "$MISSING_ENV"
done

echo "✓ validate_deploy_env DRIVE + hosted SCRATCH/SYNC-UP gates ok"

# Hosted app.sqlite must always have a Litestream destination.
for key in LITESTREAM_BUCKET LITESTREAM_REGION; do
  MISSING_ENV="$(mktemp)"
  grep -v "^${key}=" "$TMP_ENV" > "$MISSING_ENV" || true
  missing_out="$(bash "$SCRIPT" --staging --rds --env-file "$MISSING_ENV" 2>&1 || true)"
  if ! grep -q "${key} 가 비어 있습니다" <<< "$missing_out"; then
    echo "❌ hosted deployment without ${key} must fail preflight"
    echo "$missing_out"
    rm -f "$MISSING_ENV"
    exit 1
  fi
  rm -f "$MISSING_ENV"
done

MISMATCH_LITESTREAM_ENV="$(mktemp)"
sed 's/^LITESTREAM_BUCKET=.*/LITESTREAM_BUCKET=wrong-bucket/' "$TMP_ENV" > "$MISMATCH_LITESTREAM_ENV"
mismatch_out="$(bash "$SCRIPT" --staging --rds --env-file "$MISMATCH_LITESTREAM_ENV" 2>&1 || true)"
if ! grep -q '프로젝트 S3 bucket.*동일해야 함' <<< "$mismatch_out"; then
  echo "❌ Litestream bucket mismatch must fail preflight"
  echo "$mismatch_out"
  rm -f "$MISMATCH_LITESTREAM_ENV"
  exit 1
fi
rm -f "$MISMATCH_LITESTREAM_ENV"

echo "✓ validate_deploy_env hosted Litestream durability gates ok"

# Hosted requires explicit OD_S3_PURGE_ON_DELETE (Teamver standard =0).
PURGE_MISSING_ENV="$(mktemp)"
grep -v "^OD_S3_PURGE_ON_DELETE=" "$TMP_ENV" > "$PURGE_MISSING_ENV" || true
purge_missing_out="$(bash "$SCRIPT" --staging --rds --env-file "$PURGE_MISSING_ENV" 2>&1 || true)"
if ! grep -q 'OD_S3_PURGE_ON_DELETE 미설정' <<< "$purge_missing_out"; then
  echo "❌ hosted without OD_S3_PURGE_ON_DELETE must fail preflight"
  echo "$purge_missing_out"
  rm -f "$PURGE_MISSING_ENV"
  exit 1
fi
rm -f "$PURGE_MISSING_ENV"

PURGE_ZERO_ENV="$(mktemp)"
sed 's/^OD_S3_PURGE_ON_DELETE=.*/OD_S3_PURGE_ON_DELETE=0/' "$TMP_ENV" > "$PURGE_ZERO_ENV"
purge_zero_out="$(bash "$SCRIPT" --staging --rds --env-file "$PURGE_ZERO_ENV" 2>&1 || true)"
if ! grep -q 'OD_S3_PURGE_ON_DELETE=0 — delete 시 S3 tenant SSOT 유지' <<< "$purge_zero_out"; then
  echo "❌ OD_S3_PURGE_ON_DELETE=0 should pass hosted preflight"
  echo "$purge_zero_out"
  rm -f "$PURGE_ZERO_ENV"
  exit 1
fi
rm -f "$PURGE_ZERO_ENV"
echo "✓ validate_deploy_env hosted OD_S3_PURGE_ON_DELETE gates ok"

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

# Storage isolation gate (loop 138c) — staging/production .env 에서
# OD_PROJECT_STORAGE != s3 이면 반드시 fail.
LOCAL_ENV="$(mktemp)"
sed 's/^OD_PROJECT_STORAGE=.*/OD_PROJECT_STORAGE=local/' "$TMP_ENV" > "$LOCAL_ENV"
local_out="$(bash "$SCRIPT" --staging --rds --env-file "$LOCAL_ENV" 2>&1 || true)"
if grep -q '반드시 OD_PROJECT_STORAGE=s3 필요' <<< "$local_out"; then
  echo "✓ validate_deploy_env staging fails when OD_PROJECT_STORAGE=local"
else
  echo "❌ staging fixture w/ local storage should fail with isolation guard"
  echo "$local_out"
  rm -f "$LOCAL_ENV"
  exit 1
fi
if bash "$SCRIPT" --staging --rds --env-file "$LOCAL_ENV" >/dev/null 2>&1; then
  echo "❌ staging w/ OD_PROJECT_STORAGE=local must exit non-zero"
  rm -f "$LOCAL_ENV"
  exit 1
fi
rm -f "$LOCAL_ENV"

# MinIO endpoint must be rejected in staging too.
MINIO_ENV="$(mktemp)"
cat "$TMP_ENV" > "$MINIO_ENV"
echo 'OD_S3_ENDPOINT=http://minio:9000' >> "$MINIO_ENV"
minio_out="$(bash "$SCRIPT" --staging --rds --env-file "$MINIO_ENV" 2>&1 || true)"
if grep -q 'MinIO/로컬 dev endpoint 는 staging/production 에서 금지' <<< "$minio_out"; then
  echo "✓ validate_deploy_env staging fails on MinIO OD_S3_ENDPOINT"
else
  echo "❌ MinIO endpoint must fail in staging"
  echo "$minio_out"
  rm -f "$MINIO_ENV"
  exit 1
fi
rm -f "$MINIO_ENV"

FALLBACK_ENV="$(mktemp)"
cat "$TMP_ENV" > "$FALLBACK_ENV"
echo 'OD_S3_ALLOW_SCRATCH_FALLBACK=1' >> "$FALLBACK_ENV"
fallback_out="$(bash "$SCRIPT" --staging --rds --env-file "$FALLBACK_ENV" 2>&1 || true)"
if grep -q 'OD_S3_ALLOW_SCRATCH_FALLBACK=1' <<< "$fallback_out"; then
  echo "✓ validate_deploy_env staging rejects scratch-only fallback"
else
  echo "❌ staging fixture must reject OD_S3_ALLOW_SCRATCH_FALLBACK=1"
  echo "$fallback_out"
  rm -f "$FALLBACK_ENV"
  exit 1
fi
if bash "$SCRIPT" --staging --rds --env-file "$FALLBACK_ENV" >/dev/null 2>&1; then
  echo "❌ staging w/ OD_S3_ALLOW_SCRATCH_FALLBACK=1 must exit non-zero"
  rm -f "$FALLBACK_ENV"
  exit 1
fi
rm -f "$FALLBACK_ENV"

# ---------------------------------------------------------------------------
# loop 142 — production hard guard 회귀 케이스. validate_deploy_env 는
# ENV_FILE 가 `.env.production` 일 때만 추가 가드를 적용한다 (staging/dev
# 마찰을 줄이기 위해). --env-file 의 basename 으로 ENV_FILE 가 결정되므로
# 임시 디렉토리에 .env.production 파일을 만들어 fixture를 돌린다.
# ---------------------------------------------------------------------------
PROD_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_ENV" "$PROD_DIR"' EXIT

# 1) production baseline (LLM 키 없음) → fail.
grep -v -E '^(TEAMVER_OD_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY)=' "$TMP_ENV" > "$PROD_DIR/.env.production"
nokey_out="$(bash "$SCRIPT" --rds --env-file "$PROD_DIR/.env.production" 2>&1 || true)"
if ! grep -q 'TEAMVER_OD_API_KEY (managed) 또는 ANTHROPIC_API_KEY/OPENAI_API_KEY' <<< "$nokey_out"; then
  echo "❌ production w/o LLM keys must fail with managed/daemon LLM key guard"
  echo "$nokey_out"
  exit 1
fi
if bash "$SCRIPT" --rds --env-file "$PROD_DIR/.env.production" >/dev/null 2>&1; then
  echo "❌ production w/o LLM keys must exit non-zero"
  exit 1
fi
echo "✓ validate_deploy_env production fails when no managed/daemon LLM key"

# 2) production w/ static AWS keys → fail. ALLOW_STATIC_AWS_KEYS=1 시 warn 통과.
cat "$TMP_ENV" > "$PROD_DIR/.env.production"
{
  echo 'TEAMVER_OD_API_KEY=sk-test-managed'
  echo 'AWS_ACCESS_KEY_ID=AKIA-static-test'
  echo 'AWS_SECRET_ACCESS_KEY=secret-static-test'
} >> "$PROD_DIR/.env.production"
static_out="$(bash "$SCRIPT" --rds --env-file "$PROD_DIR/.env.production" 2>&1 || true)"
if ! grep -q 'EC2 IAM instance profile 만 허용' <<< "$static_out"; then
  echo "❌ production w/ static AWS keys must fail with instance-profile-only guard"
  echo "$static_out"
  exit 1
fi
if bash "$SCRIPT" --rds --env-file "$PROD_DIR/.env.production" >/dev/null 2>&1; then
  echo "❌ production w/ static AWS keys must exit non-zero"
  exit 1
fi

allow_out="$(ALLOW_STATIC_AWS_KEYS=1 bash "$SCRIPT" --rds --env-file "$PROD_DIR/.env.production" 2>&1 || true)"
if ! grep -q 'ALLOW_STATIC_AWS_KEYS=1' <<< "$allow_out"; then
  echo "❌ ALLOW_STATIC_AWS_KEYS=1 escape hatch missing"
  echo "$allow_out"
  exit 1
fi
if ! ALLOW_STATIC_AWS_KEYS=1 bash "$SCRIPT" --rds --env-file "$PROD_DIR/.env.production" >/dev/null 2>&1; then
  echo "❌ ALLOW_STATIC_AWS_KEYS=1 must pass production validate"
  exit 1
fi
echo "✓ validate_deploy_env production blocks static AWS keys (ALLOW_STATIC_AWS_KEYS=1 escape works)"

# 3) production OD_API_TOKEN looks like staging token → fail (leak guard).
cat "$TMP_ENV" > "$PROD_DIR/.env.production"
{
  echo 'TEAMVER_OD_API_KEY=sk-test-managed'
  echo 'OD_API_TOKEN=staging-leaked-token-xyz'
} >> "$PROD_DIR/.env.production"
leak_out="$(bash "$SCRIPT" --rds --env-file "$PROD_DIR/.env.production" 2>&1 || true)"
if ! grep -q "OD_API_TOKEN 값에 'staging' 포함" <<< "$leak_out"; then
  echo "❌ production w/ staging-looking OD_API_TOKEN must fail"
  echo "$leak_out"
  exit 1
fi
echo "✓ validate_deploy_env production rejects staging-looking OD_API_TOKEN"

# 4) staging stays warn-only on missing LLM key (production guard MUST NOT bleed
#    into staging .env path).
NOKEY_STAGING="$(mktemp)"
sed '/^TEAMVER_OD_API_KEY=/d; /^ANTHROPIC_API_KEY=/d; /^OPENAI_API_KEY=/d' "$TMP_ENV" > "$NOKEY_STAGING"
staging_out="$(bash "$SCRIPT" --staging --rds --env-file "$NOKEY_STAGING" 2>&1 || true)"
if grep -q '공개 사용자 chat 게이트' <<< "$staging_out"; then
  echo "❌ staging must NOT trigger production LLM hard guard"
  echo "$staging_out"
  rm -f "$NOKEY_STAGING"
  exit 1
fi
rm -f "$NOKEY_STAGING"
echo "✓ validate_deploy_env staging unaffected by production hard guards"
