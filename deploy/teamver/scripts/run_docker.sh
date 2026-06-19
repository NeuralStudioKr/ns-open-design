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
  bash scripts/run_docker.sh --staging --with-minio  # local S3-compat (MinIO profile)
  bash scripts/run_docker.sh --staging --skip-validate  # skip env preflight
  bash scripts/run_docker.sh --staging --vendor-check-only  # check SDK vendor artifacts and exit

선행: cp .env.staging.example .env.staging  (또는 .env.production.example)
EOF
}

ENV_FILE=""
USE_RDS=false
USE_LOCAL_DB=false
USE_MINIO=false
SKIP_VALIDATE=false
VENDOR_CHECK_ONLY=false

missing_teamver_vendor() {
  local od_root="$1"
  local missing=()

  [[ -f "$od_root/vendor/teamver/manifest.json" ]] || missing+=("vendor/teamver/manifest.json")
  [[ -f "$od_root/vendor/teamver/app-sdk.tgz" ]] || missing+=("vendor/teamver/app-sdk.tgz")
  if ! compgen -G "$od_root/vendor/teamver/python/teamver_app_sdk-*.whl" >/dev/null; then
    missing+=("vendor/teamver/python/teamver_app_sdk-*.whl")
  fi

  if [[ "${#missing[@]}" -eq 0 ]]; then
    return 0
  fi

  printf '%s\n' "${missing[@]}"
  return 1
}

ensure_teamver_vendor() {
  local od_root="$1"
  local missing=""

  if missing="$(missing_teamver_vendor "$od_root")"; then
    echo "✓ Teamver vendor artifacts ready"
    return 0
  fi

  echo "==> Teamver vendor artifacts missing:"
  sed 's/^/  - /' <<< "$missing"

  if [[ -f "$od_root/scripts/sync-teamver-vendor.sh" ]]; then
    echo "==> running sync-teamver-vendor.sh"
    bash "$od_root/scripts/sync-teamver-vendor.sh"
  else
    echo "❌ $od_root/scripts/sync-teamver-vendor.sh 파일 없음"
    echo "   ns-open-design repo root에서 bash scripts/sync-teamver-vendor.sh 후 vendor 산출물을 commit/pull 하세요."
    exit 1
  fi

  if missing="$(missing_teamver_vendor "$od_root")"; then
    echo "✓ Teamver vendor artifacts ready"
    return 0
  fi

  echo "❌ Teamver vendor artifacts still missing after sync:"
  sed 's/^/  - /' <<< "$missing"
  exit 1
}

while (( $# )); do
  case "$1" in
    --staging) ENV_FILE=".env.staging" ;;
    --production) ENV_FILE=".env.production" ;;
    --rds) USE_RDS=true ;;
    --local-db) USE_LOCAL_DB=true ;;
    --with-minio) USE_MINIO=true ;;
    --skip-validate) SKIP_VALIDATE=true ;;
    --vendor-check-only) VENDOR_CHECK_ONLY=true ;;
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

if [[ "$USE_MINIO" == true ]]; then
  echo "==> MinIO profile — local S3-compat (OD_PROJECT_STORAGE=s3)"
  export OD_PROJECT_STORAGE="${OD_PROJECT_STORAGE:-s3}"
  export OD_S3_BUCKET="${OD_S3_BUCKET:-teamver-design-local}"
  export OD_S3_REGION="${OD_S3_REGION:-us-east-1}"
  export OD_S3_ENDPOINT="${OD_S3_ENDPOINT:-http://minio:9000}"
  export OD_S3_ACCESS_KEY_ID="${OD_S3_ACCESS_KEY_ID:-minioadmin}"
  export OD_S3_SECRET_ACCESS_KEY="${OD_S3_SECRET_ACCESS_KEY:-minioadmin}"
fi

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

OD_ROOT="${TEAMVER_OD_ROOT_OVERRIDE:-$(cd "$ROOT/../.." && pwd)}"
ensure_teamver_vendor "$OD_ROOT"
if [[ "$VENDOR_CHECK_ONLY" == true ]]; then
  exit 0
fi

COMPOSE_ARGS=(--env-file "$ENV_FILE")
if [[ "$USE_LOCAL_DB" == true ]]; then
  COMPOSE_ARGS+=(--profile local-db)
fi
if [[ "$USE_MINIO" == true ]]; then
  COMPOSE_ARGS+=(--profile minio)
fi

SERVICES=(open-design-daemon teamver-design-api)
if [[ "$USE_LOCAL_DB" == true ]]; then
  SERVICES=(design-db "${SERVICES[@]}")
fi
if [[ "$USE_MINIO" == true ]]; then
  SERVICES=(minio minio-init "${SERVICES[@]}")
fi

docker compose "${COMPOSE_ARGS[@]}" up -d --build "${SERVICES[@]}"
docker compose "${COMPOSE_ARGS[@]}" ps

wait_for_sidecar_ready() {
  local be_port od_port
  be_port="$(sed -n 's/^BE_PORT=\([^#[:space:]]*\).*/\1/p' "$ENV_FILE" | tail -1)"
  od_port="$(sed -n 's/^OD_PORT=\([^#[:space:]]*\).*/\1/p' "$ENV_FILE" | tail -1)"
  be_port="${be_port:-16000}"
  od_port="${od_port:-7456}"
  local max_attempts=60
  echo "==> Waiting for sidecar loopback health (design-api :${be_port}, daemon :${od_port}, max ${max_attempts}x2s) …"
  for _ in $(seq 1 "$max_attempts"); do
    local be_ok=0 od_ok=0
    curl -sf --max-time 3 "http://127.0.0.1:${be_port}/api/healthz" >/dev/null 2>&1 && be_ok=1
    curl -sf --max-time 3 "http://127.0.0.1:${od_port}/api/health" >/dev/null 2>&1 && od_ok=1
    if [[ "$be_ok" -eq 1 && "$od_ok" -eq 1 ]]; then
      echo "✓ sidecar loopback health OK"
      return 0
    fi
    sleep 2
  done
  echo "⚠ sidecar not ready after $((max_attempts * 2))s — check: docker compose logs teamver-design-api open-design-daemon --tail 80"
  return 1
}

wait_for_sidecar_ready || true

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
