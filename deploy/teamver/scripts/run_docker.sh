#!/usr/bin/env bash
set -euo pipefail

# Teamver Design sidecar — docker compose 기동
#   bash scripts/run_docker.sh --staging
#   bash scripts/run_docker.sh --production
#   bash scripts/run_docker.sh --staging --rds    # AWS RDS (no local design-db)
#   bash scripts/run_docker.sh --staging --local-db

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
run_docker.sh — Teamver Design (OD + design-api)

  bash scripts/run_docker.sh --staging
  bash scripts/run_docker.sh --production
  bash scripts/run_docker.sh --staging --rds       # EC2 + AWS RDS
  bash scripts/run_docker.sh --staging --local-db  # compose Postgres (dev)
  bash scripts/run_docker.sh --staging --skip-validate  # skip env preflight

선행: cp .env.staging.example .env.staging  (또는 .env.production.example)
EOF
}

ENV_FILE=""
USE_RDS=false
USE_LOCAL_DB=false
SKIP_VALIDATE=false

while (( $# )); do
  case "$1" in
    --staging) ENV_FILE=".env.staging" ;;
    --production) ENV_FILE=".env.production" ;;
    --rds) USE_RDS=true ;;
    --local-db) USE_LOCAL_DB=true ;;
    --skip-validate) SKIP_VALIDATE=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ -z "$ENV_FILE" ]]; then
  echo "❌ --staging 또는 --production 필요"
  usage
  exit 1
fi

if [[ "$USE_RDS" == true && "$USE_LOCAL_DB" == true ]]; then
  echo "❌ --rds 와 --local-db 는 동시에 사용할 수 없습니다"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE 없음. example 파일을 복사하세요."
  exit 1
fi

ln -sf "$ENV_FILE" .env

VALIDATE_ARGS=(--"$([[ "$ENV_FILE" == ".env.staging" ]] && echo staging || echo production)")
if [[ "$USE_RDS" == true ]]; then
  VALIDATE_ARGS+=(--rds)
fi
if [[ "$SKIP_VALIDATE" != true ]]; then
  bash "$ROOT/scripts/validate_deploy_env.sh" "${VALIDATE_ARGS[@]}"
fi

if [[ "$USE_RDS" == true ]]; then
  if ! grep -q '^POSTGRES_HOST=' "$ENV_FILE" || grep -q '^POSTGRES_HOST=design-db' "$ENV_FILE"; then
    echo "❌ --rds: $ENV_FILE 에 POSTGRES_HOST=<RDS endpoint> 설정 필요"
    exit 1
  fi
fi

OD_ROOT="$(cd "$ROOT/../.." && pwd)"
if [[ ! -f "$OD_ROOT/vendor/teamver/app-sdk.tgz" ]]; then
  echo "==> Teamver vendor missing — running sync-teamver-vendor.sh"
  bash "$OD_ROOT/scripts/sync-teamver-vendor.sh"
fi

COMPOSE_ARGS=(--env-file "$ENV_FILE")
if [[ "$USE_LOCAL_DB" == true ]]; then
  COMPOSE_ARGS+=(--profile local-db)
fi

SERVICES=(open-design-daemon teamver-design-api)
if [[ "$USE_LOCAL_DB" == true ]]; then
  SERVICES=(design-db "${SERVICES[@]}")
fi

docker compose "${COMPOSE_ARGS[@]}" up -d --build "${SERVICES[@]}"
docker compose "${COMPOSE_ARGS[@]}" ps

if [[ -x "$ROOT/scripts/seed_od_runtime_config.sh" ]]; then
  bash "$ROOT/scripts/seed_od_runtime_config.sh" \
    "$([[ "$ENV_FILE" == ".env.staging" ]] && echo --staging || echo --production)" \
    || echo "⚠ seed_od_runtime_config skipped (daemon not ready yet — run manually)"
fi

if [[ -x "$ROOT/scripts/check_sidecar_deps.sh" ]]; then
  bash "$ROOT/scripts/check_sidecar_deps.sh" \
    "$([[ "$ENV_FILE" == ".env.staging" ]] && echo --staging || echo --production)" \
    || echo "⚠ check_sidecar_deps failed — inspect compose logs"
fi
