#!/usr/bin/env bash
# Fixture for check_storage_isolation.sh — verifies the script fails fast on
# OD_PROJECT_STORAGE!=s3 even when design-api / daemon are unreachable.
#
# Real live audit (docker exec + curl) runs on EC2.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/check_storage_isolation.sh"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/scripts"
cp "$SCRIPT" "$WORK/scripts/check_storage_isolation.sh"
chmod +x "$WORK/scripts/check_storage_isolation.sh"

write_env() {
  local path="$1"
  shift
  : > "$path"
  for line in "$@"; do
    echo "$line" >> "$path"
  done
}

# Case 1 — OD_PROJECT_STORAGE=local must trigger the storage guard.
write_env "$WORK/.env.staging" \
  "OD_PROJECT_STORAGE=local" \
  "OD_S3_BUCKET=teamver-design-staging-data" \
  "OD_S3_PREFIX=design/" \
  "LITESTREAM_BUCKET=teamver-design-staging-data" \
  "TEAMVER_API_BASE_URL=https://stg-api.teamver.com"

cd "$WORK"
out_local="$(CHECK_CONTAINER_ENV=0 \
  DESIGN_API_LOCAL_URL=http://127.0.0.1:1 \
  DAEMON_LOCAL_URL=http://127.0.0.1:1 \
  bash scripts/check_storage_isolation.sh --staging 2>&1 || true)"
if ! grep -q '✗ .env.staging OD_PROJECT_STORAGE=local' <<< "$out_local"; then
  echo "❌ expected guard line for OD_PROJECT_STORAGE=local"
  echo "$out_local"
  exit 1
fi
# Should also exit non-zero with that case.
if CHECK_CONTAINER_ENV=0 \
   DESIGN_API_LOCAL_URL=http://127.0.0.1:1 \
   DAEMON_LOCAL_URL=http://127.0.0.1:1 \
   bash scripts/check_storage_isolation.sh --staging >/dev/null 2>&1; then
  echo "❌ local storage must fail check_storage_isolation"
  exit 1
fi
echo "✓ check_storage_isolation fails when OD_PROJECT_STORAGE=local"

# Case 2 — OD_PROJECT_STORAGE=s3 but design-api/daemon unreachable should still
#          fail (and emit the ✓ env line + ✗ unreachable lines).
write_env "$WORK/.env.staging" \
  "OD_PROJECT_STORAGE=s3" \
  "OD_S3_BUCKET=teamver-design-staging-data" \
  "OD_S3_PREFIX=design/" \
  "LITESTREAM_BUCKET=teamver-design-staging-data" \
  "TEAMVER_API_BASE_URL=https://stg-api.teamver.com"

out_s3="$(CHECK_CONTAINER_ENV=0 \
  DESIGN_API_LOCAL_URL=http://127.0.0.1:1 \
  DAEMON_LOCAL_URL=http://127.0.0.1:1 \
  bash scripts/check_storage_isolation.sh --staging 2>&1 || true)"
if ! grep -q '✓ .env.staging OD_PROJECT_STORAGE=s3' <<< "$out_s3"; then
  echo "❌ expected ✓ line on s3 fixture"
  echo "$out_s3"
  exit 1
fi
if ! grep -q '✓ .env.staging OD_S3_ALLOW_SCRATCH_FALLBACK disabled' <<< "$out_s3"; then
  echo "❌ expected fallback-disabled line on s3 fixture"
  echo "$out_s3"
  exit 1
fi
if ! grep -q '/api/healthz/deps unreachable' <<< "$out_s3"; then
  echo "❌ expected unreachable line for design-api"
  echo "$out_s3"
  exit 1
fi
echo "✓ check_storage_isolation reports unreachable backends without env override"

write_env "$WORK/.env.staging" \
  "OD_PROJECT_STORAGE=s3" \
  "OD_S3_BUCKET=teamver-design-staging-data" \
  "OD_S3_PREFIX=design/" \
  "LITESTREAM_BUCKET=teamver-design-staging-data" \
  "OD_S3_ALLOW_SCRATCH_FALLBACK=1" \
  "TEAMVER_API_BASE_URL=https://stg-api.teamver.com"

out_fallback="$(CHECK_CONTAINER_ENV=0 \
  DESIGN_API_LOCAL_URL=http://127.0.0.1:1 \
  DAEMON_LOCAL_URL=http://127.0.0.1:1 \
  bash scripts/check_storage_isolation.sh --staging 2>&1 || true)"
if ! grep -q 'OD_S3_ALLOW_SCRATCH_FALLBACK=1' <<< "$out_fallback"; then
  echo "❌ expected fallback override to fail storage audit"
  echo "$out_fallback"
  exit 1
fi
echo "✓ check_storage_isolation fails when scratch fallback is enabled"

write_env "$WORK/.env.staging" \
  "OD_PROJECT_STORAGE=s3" \
  "OD_S3_BUCKET=teamver-design-staging-data" \
  "OD_S3_PREFIX=design" \
  "LITESTREAM_BUCKET=teamver-design-staging-data" \
  "TEAMVER_API_BASE_URL=https://stg-api.teamver.com"

out_prefix="$(CHECK_CONTAINER_ENV=0 \
  DESIGN_API_LOCAL_URL=http://127.0.0.1:1 \
  DAEMON_LOCAL_URL=http://127.0.0.1:1 \
  bash scripts/check_storage_isolation.sh --staging 2>&1 || true)"
if ! grep -q 'OD_S3_PREFIX=design (must end with /' <<< "$out_prefix"; then
  echo "❌ expected trailing-slash guard for OD_S3_PREFIX"
  echo "$out_prefix"
  exit 1
fi
echo "✓ check_storage_isolation fails when OD_S3_PREFIX lacks trailing slash"

write_env "$WORK/.env.staging" \
  "OD_PROJECT_STORAGE=s3" \
  "OD_S3_BUCKET=teamver-design-staging-data" \
  "OD_S3_PREFIX=design/" \
  "LITESTREAM_BUCKET=wrong-bucket" \
  "TEAMVER_API_BASE_URL=https://stg-api.teamver.com"

out_litestream="$(CHECK_CONTAINER_ENV=0 \
  DESIGN_API_LOCAL_URL=http://127.0.0.1:1 \
  DAEMON_LOCAL_URL=http://127.0.0.1:1 \
  bash scripts/check_storage_isolation.sh --staging 2>&1 || true)"
if ! grep -q 'LITESTREAM_BUCKET=wrong-bucket != OD_S3_BUCKET' <<< "$out_litestream"; then
  echo "❌ expected Litestream bucket mismatch guard"
  echo "$out_litestream"
  exit 1
fi
echo "✓ check_storage_isolation fails when LITESTREAM_BUCKET mismatches OD_S3_BUCKET"

echo "✓ all check_storage_isolation fixtures passed"
