#!/usr/bin/env bash
# Static fixture for deploy.sh sidecar readiness wait (run_docker.sh delegates here).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$ROOT/deploy.sh"
RUN_DOCKER="$ROOT/scripts/run_docker.sh"

if [[ ! -f "$DEPLOY" ]]; then
  echo "❌ missing $DEPLOY"
  exit 1
fi

bash -n "$DEPLOY"
bash -n "$RUN_DOCKER"

source_count="$(grep -c 'source "$ENV_FILE"' "$DEPLOY" || true)"
if [[ "$source_count" != "0" ]]; then
  echo "❌ deploy readiness wait must not source .env directly"
  exit 1
fi

if grep -q 'ln -sf' "$DEPLOY"; then
  echo "❌ deploy.sh must not create .env symlink"
  exit 1
fi

for needle in \
  'wait_for_litestream_running()' \
  'ps --status running --services litestream' \
  'wait_for_litestream_running' \
  'wait_for_sidecar_ready()' \
  'BE_PORT=' \
  'OD_PORT=' \
  'http://127.0.0.1:${be_port}/api/healthz' \
  'http://127.0.0.1:${od_port}/api/health' \
  'wait_for_sidecar_ready || true' \
  'design_compose_build_args' \
  'env-file .env.staging'
do
  if ! grep -qF "$needle" "$DEPLOY"; then
    echo "❌ deploy.sh fixture missing: $needle"
    exit 1
  fi
done

up_line="$(grep -n 'DESIGN_COMPOSE_ARGS\[@\]}.*up -d --build' "$DEPLOY" | cut -d: -f1 | head -1)"
wait_line="$(grep -n 'wait_for_sidecar_ready || true' "$DEPLOY" | cut -d: -f1 | head -1)"
seed_line="$(grep -n 'seed_od_runtime_config.sh' "$DEPLOY" | cut -d: -f1 | head -1)"
litestream_wait_line="$(grep -n '^wait_for_litestream_running$' "$DEPLOY" | cut -d: -f1 | head -1)"

if [[ -z "$up_line" || -z "$wait_line" || -z "$seed_line" ]]; then
  echo "❌ unable to locate deploy compose/wait/seed lines"
  exit 1
fi

if [[ -z "$litestream_wait_line" || "$litestream_wait_line" -le "$up_line" || "$litestream_wait_line" -ge "$wait_line" ]]; then
  echo "❌ Litestream readiness gate must run after compose up and before API readiness"
  exit 1
fi

if (( wait_line <= up_line || wait_line >= seed_line )); then
  echo "❌ readiness wait must run after compose up and before runtime-config seed"
  exit 1
fi

echo "✓ deploy readiness wait fixture ok"
