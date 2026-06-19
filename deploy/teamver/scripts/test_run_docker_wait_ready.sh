#!/usr/bin/env bash
# Static fixture for run_docker.sh sidecar readiness wait.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/run_docker.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "❌ missing $SCRIPT"
  exit 1
fi

bash -n "$SCRIPT"

source_count="$(grep -c 'source "$ENV_FILE"' "$SCRIPT" || true)"
if [[ "$source_count" != "0" ]]; then
  echo "❌ run_docker readiness wait must not source .env directly"
  exit 1
fi

for needle in \
  'wait_for_sidecar_ready()' \
  'BE_PORT=' \
  'OD_PORT=' \
  'http://127.0.0.1:${be_port}/api/healthz' \
  'http://127.0.0.1:${od_port}/api/health' \
  'wait_for_sidecar_ready || true'
do
  if ! grep -qF "$needle" "$SCRIPT"; then
    echo "❌ run_docker readiness fixture missing: $needle"
    exit 1
  fi
done

up_line="$(grep -n 'docker compose "${COMPOSE_ARGS\[@\]}" up -d --build "${SERVICES\[@\]}"' "$SCRIPT" | cut -d: -f1 | head -1)"
wait_line="$(grep -n 'wait_for_sidecar_ready || true' "$SCRIPT" | cut -d: -f1 | head -1)"
seed_line="$(grep -n 'seed_od_runtime_config.sh' "$SCRIPT" | cut -d: -f1 | head -1)"

if [[ -z "$up_line" || -z "$wait_line" || -z "$seed_line" ]]; then
  echo "❌ unable to locate run_docker compose/wait/seed lines"
  exit 1
fi

if (( wait_line <= up_line || wait_line >= seed_line )); then
  echo "❌ readiness wait must run after compose up and before runtime-config seed"
  exit 1
fi

echo "✓ run_docker readiness wait fixture ok"
