#!/usr/bin/env bash
# Local MinIO + S3 mode for Teamver Design daemon (P1-9 dev harness).
# 선택 사항 — 일반 로컬 개발은 OD_PROJECT_STORAGE=local (MinIO 불필요).
# SSOT: docs-teamver/09_Design_저장소_격리_출시게이트.md §10.1
#
# Usage (deploy/teamver):
#   bash scripts/run_minio_s3_dev.sh
#   bash scripts/run_minio_s3_dev.sh --integration-test
#
# Starts minio profile, prints env overrides, optionally runs vitest integration.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RUN_TEST=0
for arg in "$@"; do
  case "$arg" in
    --integration-test) RUN_TEST=1 ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker required"
  exit 1
fi

ENV_FILE=".env.staging"
if [[ ! -f .env.staging && -f .env ]]; then
  ENV_FILE=".env"
fi

# shellcheck source=lib/design_compose.sh
source "$ROOT/scripts/lib/design_compose.sh"
design_compose_build_args "$ROOT" "$ENV_FILE"

export OD_S3_BUCKET="${OD_S3_BUCKET:-teamver-design-local}"
export OD_S3_REGION="${OD_S3_REGION:-us-east-1}"
export OD_S3_ACCESS_KEY_ID="${OD_S3_ACCESS_KEY_ID:-minioadmin}"
export OD_S3_SECRET_ACCESS_KEY="${OD_S3_SECRET_ACCESS_KEY:-minioadmin}"
export OD_S3_ENDPOINT="${OD_S3_ENDPOINT:-http://127.0.0.1:19000}"
export OD_PROJECT_STORAGE=s3

echo "==> starting MinIO profile (bucket=${OD_S3_BUCKET})"
"${DESIGN_COMPOSE_ARGS[@]}" --profile minio up -d minio minio-init
"${DESIGN_COMPOSE_ARGS[@]}" --profile minio ps minio

cat <<EOF

==> S3 dev env (add to ${ENV_FILE} for daemon compose):
OD_PROJECT_STORAGE=s3
OD_S3_BUCKET=${OD_S3_BUCKET}
OD_S3_REGION=${OD_S3_REGION}
OD_S3_ENDPOINT=http://minio:9000
OD_S3_ACCESS_KEY_ID=${OD_S3_ACCESS_KEY_ID}
OD_S3_SECRET_ACCESS_KEY=${OD_S3_SECRET_ACCESS_KEY}
OD_SCRATCH_DIR=/app/.od/scratch

Host integration test endpoint: ${OD_S3_ENDPOINT}

EOF

if [[ "$RUN_TEST" -eq 1 ]]; then
  echo "==> running daemon S3 integration test"
  bash "$ROOT/scripts/run_s3_integration_test.sh"
fi

echo "✓ MinIO S3 dev ready"
