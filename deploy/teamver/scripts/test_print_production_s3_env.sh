#!/usr/bin/env bash
# Fixture checks for print_production_s3_env.sh (defaults + terraform fallback).
#
# Usage: bash deploy/teamver/scripts/test_print_production_s3_env.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/print_production_s3_env.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "❌ missing $SCRIPT"
  exit 1
fi

default_out="$(bash "$SCRIPT")"
for needle in \
  'OD_PROJECT_STORAGE=s3' \
  'OD_S3_BUCKET=teamver-design-prod-data' \
  'OD_S3_REGION=ap-northeast-2' \
  'POSTGRES_DB=teamver_design_production' \
  'LITESTREAM_BUCKET=teamver-design-prod-data'
do
  if ! grep -q -- "$needle" <<< "$default_out"; then
    echo "❌ default output missing: $needle"
    echo "$default_out"
    exit 1
  fi
done

override_out="$(OD_S3_BUCKET='custom-prod-bucket' OD_S3_REGION='us-east-1' OD_S3_PREFIX='custom/' bash "$SCRIPT")"
for needle in \
  'OD_S3_BUCKET=custom-prod-bucket' \
  'OD_S3_REGION=us-east-1' \
  'OD_S3_PREFIX=custom/' \
  'AWS_REGION=us-east-1'
do
  if ! grep -q -- "$needle" <<< "$override_out"; then
    echo "❌ override output missing: $needle"
    echo "$override_out"
    exit 1
  fi
done

# Without terraform initialized, --from-terraform should still emit S3 defaults (no crash).
tf_out="$(bash "$SCRIPT" --from-terraform 2>&1 || true)"
if ! grep -q 'OD_PROJECT_STORAGE=s3' <<< "$tf_out"; then
  echo "❌ --from-terraform output missing S3 block"
  echo "$tf_out"
  exit 1
fi

if bash "$SCRIPT" --not-a-flag >/dev/null 2>&1; then
  echo "❌ expected failure for unknown flag"
  exit 1
fi

echo "✓ print_production_s3_env fixture ok"

