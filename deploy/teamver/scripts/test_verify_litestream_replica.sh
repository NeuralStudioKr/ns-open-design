#!/usr/bin/env bash
# Fixture tests for verify_litestream_replica.sh (no docker/aws required).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/verify_litestream_replica.sh"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/scripts"
cp "$SCRIPT" "$WORK/scripts/verify_litestream_replica.sh"
chmod +x "$WORK/scripts/verify_litestream_replica.sh"

write_env() {
  local path="$1"
  shift
  : > "$path"
  for line in "$@"; do
    echo "$line" >> "$path"
  done
}

write_env "$WORK/.env.staging" \
  "OD_S3_BUCKET=teamver-design-staging-data" \
  "LITESTREAM_BUCKET=wrong-bucket"

cd "$WORK"
if SKIP_S3_PROBE=1 bash scripts/verify_litestream_replica.sh --staging >/dev/null 2>&1; then
  echo "❌ bucket mismatch must fail"
  exit 1
fi
echo "✓ verify_litestream_replica fails on LITESTREAM_BUCKET mismatch"

write_env "$WORK/.env.staging" \
  "OD_S3_BUCKET=teamver-design-staging-data" \
  "LITESTREAM_BUCKET=teamver-design-staging-data" \
  "LITESTREAM_SYNC_INTERVAL=3s"

out_ok="$(SKIP_S3_PROBE=1 bash scripts/verify_litestream_replica.sh --staging 2>&1 || true)"
if ! grep -q 'co-located with OD_S3_BUCKET' <<< "$out_ok"; then
  echo "❌ expected co-located ok line"
  echo "$out_ok"
  exit 1
fi
echo "✓ verify_litestream_replica env co-location check (SKIP_S3_PROBE)"

# docs-teamver/39_3 §5.2 — per-node LITESTREAM_REPLICA_PATH must be
# reflected in the header banner. verify uses this prefix for the S3
# probe when SKIP_S3_PROBE is off.
out_multinode="$(SKIP_S3_PROBE=1 \
  LITESTREAM_REPLICA_PATH=litestream/i-0abc/app.sqlite \
  bash scripts/verify_litestream_replica.sh --staging 2>&1 || true)"
if ! grep -q 'prefix=litestream/i-0abc/app.sqlite' <<< "$out_multinode"; then
  echo "❌ LITESTREAM_REPLICA_PATH env not honored in banner"
  echo "$out_multinode"
  exit 1
fi
echo "✓ verify_litestream_replica honors LITESTREAM_REPLICA_PATH override"

echo "✓ all verify_litestream_replica fixtures passed"
