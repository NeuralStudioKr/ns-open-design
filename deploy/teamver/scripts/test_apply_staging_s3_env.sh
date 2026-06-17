#!/usr/bin/env bash
# Fixture checks for apply_staging_s3_env.sh (dry-run merging vs new keys).
#
# Usage: bash deploy/teamver/scripts/test_apply_staging_s3_env.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/apply_staging_s3_env.sh"
PRINT_SCRIPT="$ROOT/scripts/print_staging_s3_env.sh"

if [[ ! -f "$SCRIPT" || ! -f "$PRINT_SCRIPT" ]]; then
  echo "❌ missing $SCRIPT or $PRINT_SCRIPT"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ENV_FILE="$WORK/.env.staging"
cat > "$ENV_FILE" <<'EOF'
# Existing staging env (subset)
OD_PROJECT_STORAGE=local
OD_S3_BUCKET=
TEAMVER_JWT_SECRET=keep-me
EOF

dry_out="$(OD_S3_BUCKET='teamver-design-staging-data' \
  OD_S3_REGION='ap-northeast-2' \
  OD_S3_PREFIX='design/' \
  bash "$SCRIPT" --dry-run --env-file "$ENV_FILE")"

for needle in \
  'OD_PROJECT_STORAGE=s3' \
  'OD_S3_BUCKET=teamver-design-staging-data' \
  'OD_S3_REGION=ap-northeast-2' \
  'TEAMVER_JWT_SECRET=keep-me' \
  'dry-run diff'
do
  if ! grep -q -- "$needle" <<< "$dry_out"; then
    echo "❌ dry-run output missing: $needle"
    echo "$dry_out"
    exit 1
  fi
done

# Dry-run must not mutate the env file.
if grep -q '^OD_PROJECT_STORAGE=s3' "$ENV_FILE"; then
  echo "❌ dry-run mutated env file"
  exit 1
fi

# Reject unknown flag.
if bash "$SCRIPT" --not-a-flag >/dev/null 2>&1; then
  echo "❌ expected failure for unknown flag"
  exit 1
fi

# Missing env file.
if bash "$SCRIPT" --dry-run --env-file "$WORK/.env.missing" >/dev/null 2>&1; then
  echo "❌ expected failure for missing env file"
  exit 1
fi

echo "✓ apply_staging_s3_env fixture ok"
