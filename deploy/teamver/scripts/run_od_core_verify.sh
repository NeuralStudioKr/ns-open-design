#!/usr/bin/env bash
# OD core-only verify stack (:7457) — staging sidecar 를 중단하지 않고 격리 검증.
#
# Usage:
#   bash scripts/run_od_core_verify.sh start --staging
#   bash scripts/run_od_core_verify.sh seed --staging
#   bash scripts/run_od_core_verify.sh verify
#   bash scripts/run_od_core_verify.sh full --staging   # start + seed + verify
#   bash scripts/run_od_core_verify.sh stop
#   bash scripts/run_od_core_verify.sh status

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="docker-compose.od-core-verify.yml"
ENV_FILE=".env"
ACTION=""
VERIFY_URL="http://127.0.0.1:7457"
SERVICE="od-core-verify"

usage() {
  cat <<'EOF'
run_od_core_verify.sh — isolated OD daemon on :7457 (no Teamver design-api)

  bash scripts/run_od_core_verify.sh start --staging
  bash scripts/run_od_core_verify.sh seed --staging
  bash scripts/run_od_core_verify.sh verify [--project-smoke]
  bash scripts/run_od_core_verify.sh full --staging
  bash scripts/run_od_core_verify.sh stop
  bash scripts/run_od_core_verify.sh status

Requires: OPEN_DESIGN_IMAGE / OD_API_TOKEN in env file (same as main sidecar).
EOF
}

EXTRA_VERIFY_ARGS=()

while (( $# )); do
  case "$1" in
    start|stop|verify|seed|full|status) ACTION="$1" ;;
    --staging) ENV_FILE=".env.staging" ;;
    --production) ENV_FILE=".env.production" ;;
    --project-smoke) EXTRA_VERIFY_ARGS+=(--project-smoke) ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ -z "$ACTION" ]]; then
  echo "❌ action 필요: start|seed|verify|full|stop|status"
  usage
  exit 1
fi

if [[ ! -f "$ENV_FILE" && -f .env ]]; then
  ENV_FILE=".env"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE 없음"
  exit 1
fi

ln -sf "$ENV_FILE" .env

COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

env_flag() {
  case "$ENV_FILE" in
    .env.staging) echo --staging ;;
    .env.production) echo --production ;;
    *) ;;
  esac
}

case "$ACTION" in
  start)
    echo "==> Starting OD core verify stack on 127.0.0.1:7457 …"
    "${COMPOSE[@]}" up -d
    echo "==> Waiting for health …"
    for _ in $(seq 1 30); do
      if curl -sf --max-time 3 "${VERIFY_URL}/api/health" >/dev/null 2>&1; then
        echo "✓ healthy"
        exit 0
      fi
      sleep 2
    done
    echo "❌ health timeout — docker logs $SERVICE"
    docker logs "$SERVICE" 2>&1 | tail -30
    exit 1
    ;;
  stop)
    echo "==> Stopping OD core verify stack …"
    "${COMPOSE[@]}" down
    echo "✓ stopped (volume od_core_verify_data 유지 — 완전 삭제: docker volume rm teamver-od-core-verify_od_core_verify_data)"
    ;;
  status)
    "${COMPOSE[@]}" ps
    curl -sf "${VERIFY_URL}/api/health" >/dev/null && echo "✓ ${VERIFY_URL}/api/health" || echo "○ daemon not healthy"
    ;;
  seed)
    flag="$(env_flag)"
    bash "$ROOT/scripts/seed_od_runtime_config.sh" ${flag:+$flag} --service "$SERVICE"
    bash "$ROOT/scripts/seed_od_byok_app_config.sh" ${flag:+$flag} --service "$SERVICE"
    ;;
  verify)
    bash "$ROOT/scripts/verify_od_core.sh" \
      --url "$VERIFY_URL" \
      --no-teamver-gate \
      --service "$SERVICE" \
      "${EXTRA_VERIFY_ARGS[@]}"
    ;;
  full)
    flag="$(env_flag)"
    bash "$0" start ${flag:+$flag}
    bash "$0" seed ${flag:+$flag}
    bash "$0" verify "${EXTRA_VERIFY_ARGS[@]}"
    ;;
esac
