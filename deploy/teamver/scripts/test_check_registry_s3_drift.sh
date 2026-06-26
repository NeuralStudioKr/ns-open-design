#!/usr/bin/env bash
# Fixture for check_registry_s3_drift.sh — usage/help and env guards only.
# Live RDS+S3 audit runs on EC2 with psql + aws.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/check_registry_s3_drift.sh"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/scripts"
cp "$SCRIPT" "$WORK/scripts/check_registry_s3_drift.sh"
chmod +x "$WORK/scripts/check_registry_s3_drift.sh"

write_env() {
  local path="$1"
  shift
  : > "$path"
  for line in "$@"; do
    echo "$line" >> "$path"
  done
}

write_env "$WORK/.env.staging" \
  "OD_PROJECT_STORAGE=s3" \
  "OD_S3_BUCKET=teamver-design-staging-data" \
  "OD_S3_PREFIX=design/"

cd "$WORK"

out_no_db="$(bash scripts/check_registry_s3_drift.sh --staging 2>&1 || true)"
if grep -q 'MAIN_BE_DATABASE_URL' <<< "$out_no_db"; then
  echo "✓ check_registry_s3_drift fails without database URL"
else
  echo "❌ expected database URL guard"
  echo "$out_no_db"
  exit 1
fi

echo "✓ check_registry_s3_drift fixture passed (live RDS+S3 audit: EC2에서 psql+aws로 실행)"
