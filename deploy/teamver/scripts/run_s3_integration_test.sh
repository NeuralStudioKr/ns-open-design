#!/usr/bin/env bash
# P1-9 — MinIO-backed S3ProjectStorage integration test (daemon).
#
# Usage (ns-open-design repo root or deploy/teamver):
#   bash deploy/teamver/scripts/run_s3_integration_test.sh
#
# Requires: docker, pnpm, @open-design/daemon deps installed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CONTAINER_NAME="teamver-od-minio-test-$$"
MINIO_PORT="${MINIO_PORT:-19000}"
BUCKET="${OD_S3_TEST_BUCKET:-teamver-design-test}"
ACCESS_KEY="${OD_S3_TEST_ACCESS_KEY_ID:-minioadmin}"
SECRET_KEY="${OD_S3_TEST_SECRET_ACCESS_KEY:-minioadmin}"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker required for MinIO integration test" >&2
  exit 1
fi

echo "==> starting MinIO on 127.0.0.1:${MINIO_PORT}"
docker run -d --name "$CONTAINER_NAME" \
  -p "127.0.0.1:${MINIO_PORT}:9000" \
  -e MINIO_ROOT_USER="$ACCESS_KEY" \
  -e MINIO_ROOT_PASSWORD="$SECRET_KEY" \
  minio/minio server /data >/dev/null

echo "==> waiting for MinIO"
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${MINIO_PORT}/minio/health/live" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -sf "http://127.0.0.1:${MINIO_PORT}/minio/health/live" >/dev/null

echo "==> creating bucket ${BUCKET}"
docker run --rm --network "container:${CONTAINER_NAME}" \
  minio/mc alias set local http://127.0.0.1:9000 "$ACCESS_KEY" "$SECRET_KEY" >/dev/null
docker run --rm --network "container:${CONTAINER_NAME}" \
  minio/mc mb --ignore-existing "local/${BUCKET}" >/dev/null

export OD_S3_TEST_ENDPOINT="http://127.0.0.1:${MINIO_PORT}"
export OD_S3_TEST_BUCKET="$BUCKET"
export OD_S3_TEST_REGION="${OD_S3_TEST_REGION:-us-east-1}"
export OD_S3_TEST_ACCESS_KEY_ID="$ACCESS_KEY"
export OD_S3_TEST_SECRET_ACCESS_KEY="$SECRET_KEY"
export OD_S3_TEST_PREFIX="integration/"

echo "==> vitest S3 integration"
cd "$ROOT"
pnpm --filter @open-design/daemon test -- tests/s3-project-storage.integration.test.ts

echo "✅ S3 integration test passed"
