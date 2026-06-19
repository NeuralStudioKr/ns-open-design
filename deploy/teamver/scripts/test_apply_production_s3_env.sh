#!/usr/bin/env bash
# Fixture checks for apply_production_s3_env.sh (dry-run + idempotent merge).
#
# Usage: bash deploy/teamver/scripts/test_apply_production_s3_env.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/apply_production_s3_env.sh"
PRINT_SCRIPT="$ROOT/scripts/print_production_s3_env.sh"

if [[ ! -f "$SCRIPT" || ! -f "$PRINT_SCRIPT" ]]; then
  echo "❌ missing $SCRIPT or $PRINT_SCRIPT"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ENV_FILE="$WORK/.env.production"
cat > "$ENV_FILE" <<'EOF'
# Existing production env (subset)
OD_PROJECT_STORAGE=local
OD_S3_BUCKET=
TEAMVER_JWT_SECRET=keep-me
EOF

dry_out="$(OD_S3_BUCKET='teamver-design-prod-data' \
  OD_S3_REGION='ap-northeast-2' \
  OD_S3_PREFIX='design/' \
  bash "$SCRIPT" --dry-run --env-file "$ENV_FILE")"

for needle in \
  'OD_PROJECT_STORAGE=s3' \
  'OD_S3_BUCKET=teamver-design-prod-data' \
  'OD_S3_REGION=ap-northeast-2' \
  'LITESTREAM_BUCKET=teamver-design-prod-data' \
  'TEAMVER_JWT_SECRET=keep-me' \
  'dry-run diff'
do
  if ! grep -q -- "$needle" <<< "$dry_out"; then
    echo "❌ dry-run output missing: $needle"
    echo "$dry_out"
    exit 1
  fi
done

if grep -q '^OD_PROJECT_STORAGE=s3' "$ENV_FILE"; then
  echo "❌ dry-run mutated env file"
  exit 1
fi

if bash "$SCRIPT" --not-a-flag >/dev/null 2>&1; then
  echo "❌ expected failure for unknown flag"
  exit 1
fi

if bash "$SCRIPT" --dry-run --env-file "$WORK/.env.missing" >/dev/null 2>&1; then
  echo "❌ expected failure for missing env file"
  exit 1
fi

IDEM_ENV="$WORK/.env.production.idem"
cat > "$IDEM_ENV" <<'EOF'
# already migrated
OD_PROJECT_STORAGE=s3
OD_S3_BUCKET=teamver-design-prod-data
OD_S3_REGION=ap-northeast-2
TEAMVER_JWT_SECRET=keep-me
EOF

OD_S3_BUCKET='teamver-design-prod-data' \
  OD_S3_REGION='ap-northeast-2' \
  OD_S3_PREFIX='design/' \
  bash "$SCRIPT" --env-file "$IDEM_ENV" >/dev/null

OD_S3_BUCKET='teamver-design-prod-data' \
  OD_S3_REGION='ap-northeast-2' \
  OD_S3_PREFIX='design/' \
  bash "$SCRIPT" --env-file "$IDEM_ENV" >/dev/null

if ! grep -q '^TEAMVER_JWT_SECRET=keep-me$' "$IDEM_ENV"; then
  echo "❌ idempotent apply lost unrelated keys"
  cat "$IDEM_ENV"
  exit 1
fi

for key in OD_PROJECT_STORAGE OD_S3_BUCKET OD_S3_REGION OD_S3_PREFIX LITESTREAM_BUCKET; do
  count="$(grep -c "^${key}=" "$IDEM_ENV" || true)"
  if [[ "$count" -ne 1 ]]; then
    echo "❌ idempotent apply duplicated ${key} (count=${count})"
    cat "$IDEM_ENV"
    exit 1
  fi
done

section_count="$(grep -c -- '--- OD project storage (apply_production_s3_env.sh) ---' "$IDEM_ENV" || true)"
if [[ "$section_count" -gt 1 ]]; then
  echo "❌ migration section duplicated after second apply (count=$section_count)"
  cat "$IDEM_ENV"
  exit 1
fi

echo "✓ apply_production_s3_env fixture ok"

