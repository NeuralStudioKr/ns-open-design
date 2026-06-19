#!/usr/bin/env bash
# Teamver Design deploy.sh — ns-teamver-be / ns-teamver-slide deploy.sh 패턴.
# .env symlink 없이 --env-file .env.staging|.env.production 직접 사용.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=scripts/lib/design_compose.sh
source "$SCRIPT_DIR/scripts/lib/design_compose.sh"

show_help() {
  cat << EOF
Usage: $0 --staging | --production [options]

환경 파일 선택:
  --staging       사용 환경 파일: .env.staging  (Compose 프로젝트 teamver-open-design)
  --production    사용 환경 파일: .env.production (Compose 프로젝트 teamver-open-design)

옵션:
  --no-cache        Docker 빌드 시 캐시 미사용
  --rds             AWS RDS (POSTGRES_HOST=RDS endpoint, 로컬 design-db 미사용)
  --local-db        compose Postgres 프로필 (dev/레거시)
  --with-minio      MinIO 프로필 (로컬 S3-compat)
  --skip-validate   validate_deploy_env.sh 생략
  --vendor-check-only  Teamver SDK vendor 산출물만 확인 후 종료

예시:
  $0 --staging
  $0 --staging --rds
  $0 --staging --no-cache
  $0 --production --rds

주의:
  - .env 심볼릭 링크를 만들지 않습니다. compose 는 --env-file 로 env 파일을 직접 읽습니다.
  - teamver-design-api env_file 은 docker-compose.staging.yml / docker-compose.production.yml override.
  - 선행: cp .env.staging.example .env.staging (또는 .env.production.example)
EOF
}

NO_CACHE=""
ENV_FILE=""
TARGET_ENV=""
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

for arg in "$@"; do
  case "$arg" in
    --no-cache) NO_CACHE="--no-cache" ;;
    --staging) ENV_FILE=".env.staging"; TARGET_ENV="staging" ;;
    --production) ENV_FILE=".env.production"; TARGET_ENV="production" ;;
    --rds) USE_RDS=true ;;
    --local-db) USE_LOCAL_DB=true ;;
    --with-minio) USE_MINIO=true ;;
    --skip-validate) SKIP_VALIDATE=true ;;
    --vendor-check-only) VENDOR_CHECK_ONLY=true ;;
    --help|-h) show_help; exit 0 ;;
    *) echo "Error: Unknown option: $arg" >&2; show_help; exit 1 ;;
  esac
done

HAS_ENV_OPT=0
for arg in "$@"; do
  case "$arg" in
    --staging|--production) HAS_ENV_OPT=1 ;;
  esac
done

if [[ $# -eq 0 || "$HAS_ENV_OPT" -eq 0 ]]; then
  show_help
  exit 1
fi

if [[ "$USE_RDS" == true && "$USE_LOCAL_DB" == true ]]; then
  echo "❌ --rds 와 --local-db 는 동시에 사용할 수 없습니다"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: 환경 파일 '$ENV_FILE'이(가) 없습니다." >&2
  echo "       예시: cp .env.${TARGET_ENV}.example $ENV_FILE 후 값을 채우세요." >&2
  exit 1
fi

if ! grep -qE '^[A-Za-z_][A-Za-z0-9_]*=.+$' "$ENV_FILE" 2>/dev/null; then
  echo "Error: '$ENV_FILE'에 유효한 KEY=value 행이 없습니다." >&2
  exit 1
fi

_get_env_kv() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed "s/^['\"]//;s/['\"]$//" | xargs
}

print_deploy_diagnostic() {
  local override project
  override="$(design_compose_override_file)"
  project="$(design_compose_project_name)"
  echo ""
  echo "=========================================="
  echo "==== Deploy ($TARGET_ENV) ===="
  echo "=========================================="
  echo "📄 환경 파일: $ENV_FILE"
  echo "📦 Compose 프로젝트: $project"
  echo "📋 Compose 파일: docker-compose.yml${override:+ + $override}"
  echo "🔗 env 주입: --env-file $ENV_FILE (symlink .env 미사용)"
  echo ""
  echo "[RDS / DB]"
  if [[ "$USE_LOCAL_DB" == true ]]; then
    echo "  모드: --local-db (compose Postgres 프로필)"
  elif [[ "$USE_RDS" == true ]]; then
    echo "  모드: --rds (POSTGRES_HOST=$(_get_env_kv POSTGRES_HOST))"
  else
    echo "  모드: .env 의 POSTGRES_HOST=$(_get_env_kv POSTGRES_HOST)"
  fi
  echo ""
  echo "[Managed API / embed]"
  if [[ -n "$(_get_env_kv TEAMVER_OD_API_KEY)" ]]; then
    echo "  TEAMVER_OD_API_KEY: 설정됨 (runtime-config managed BYOK)"
  elif [[ -n "$(_get_env_kv ANTHROPIC_API_KEY)" ]]; then
    echo "  ANTHROPIC_API_KEY: 설정됨 (daemon BYOK)"
  else
    echo "  ⚠ TEAMVER_OD_API_KEY·ANTHROPIC_API_KEY 없음 — embed chat 비활성 가능"
  fi
  echo "=========================================="
  echo ""
}

VALIDATE_ARGS=(--"$TARGET_ENV")
if [[ "$USE_RDS" == true ]]; then
  VALIDATE_ARGS+=(--rds)
fi
if [[ "$SKIP_VALIDATE" != true ]]; then
  bash "$SCRIPT_DIR/scripts/validate_deploy_env.sh" "${VALIDATE_ARGS[@]}"
fi

if [[ "$USE_RDS" == true ]]; then
  if ! grep -q '^POSTGRES_HOST=' "$ENV_FILE" || grep -q '^POSTGRES_HOST=design-db' "$ENV_FILE"; then
    echo "❌ --rds: $ENV_FILE 에 POSTGRES_HOST=<RDS endpoint> 설정 필요"
    exit 1
  fi
fi

design_compose_build_args "$SCRIPT_DIR" "$ENV_FILE"
print_deploy_diagnostic

if [[ "$USE_MINIO" == true ]]; then
  echo "==> MinIO profile — local S3-compat (OD_PROJECT_STORAGE=s3)"
  export OD_PROJECT_STORAGE="${OD_PROJECT_STORAGE:-s3}"
  export OD_S3_BUCKET="${OD_S3_BUCKET:-teamver-design-local}"
  export OD_S3_REGION="${OD_S3_REGION:-us-east-1}"
  export OD_S3_ENDPOINT="${OD_S3_ENDPOINT:-http://minio:9000}"
  export OD_S3_ACCESS_KEY_ID="${OD_S3_ACCESS_KEY_ID:-minioadmin}"
  export OD_S3_SECRET_ACCESS_KEY="${OD_S3_SECRET_ACCESS_KEY:-minioadmin}"
fi

OD_ROOT="${TEAMVER_OD_ROOT_OVERRIDE:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
ensure_teamver_vendor "$OD_ROOT"
if [[ "$VENDOR_CHECK_ONLY" == true ]]; then
  exit 0
fi

COMPOSE_EXTRA_ARGS=()
if [[ "$USE_LOCAL_DB" == true ]]; then
  COMPOSE_EXTRA_ARGS+=(--profile local-db)
fi
if [[ "$USE_MINIO" == true ]]; then
  COMPOSE_EXTRA_ARGS+=(--profile minio)
fi

SERVICES=(open-design-daemon teamver-design-api)
if [[ "$USE_LOCAL_DB" == true ]]; then
  SERVICES=(design-db "${SERVICES[@]}")
fi
if [[ "$USE_MINIO" == true ]]; then
  SERVICES=(minio minio-init "${SERVICES[@]}")
fi

if [[ -n "$NO_CACHE" ]]; then
  "${DESIGN_COMPOSE_ARGS[@]}" "${COMPOSE_EXTRA_ARGS[@]}" build --no-cache "${SERVICES[@]}"
fi

"${DESIGN_COMPOSE_ARGS[@]}" "${COMPOSE_EXTRA_ARGS[@]}" up -d --build "${SERVICES[@]}"
"${DESIGN_COMPOSE_ARGS[@]}" "${COMPOSE_EXTRA_ARGS[@]}" ps

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
  echo "⚠ sidecar not ready after $((max_attempts * 2))s — check: ${DESIGN_COMPOSE_ARGS[*]} logs teamver-design-api open-design-daemon --tail 80"
  return 1
}

wait_for_sidecar_ready || true

ENV_FLAG="$(design_compose_env_flag)"
if [[ -x "$SCRIPT_DIR/scripts/seed_od_runtime_config.sh" ]]; then
  bash "$SCRIPT_DIR/scripts/seed_od_runtime_config.sh" ${ENV_FLAG:+$ENV_FLAG} \
    || echo "⚠ seed_od_runtime_config skipped (daemon not ready yet — run manually)"
fi

if [[ -x "$SCRIPT_DIR/scripts/check_sidecar_deps.sh" ]]; then
  bash "$SCRIPT_DIR/scripts/check_sidecar_deps.sh" ${ENV_FLAG:+$ENV_FLAG} \
    || echo "⚠ check_sidecar_deps failed — inspect compose logs"
fi

echo ""
echo "==== Deploy 완료 ($TARGET_ENV) ===="
echo ""
echo "다음:"
echo "  - bash scripts/smoke_design.sh ${ENV_FLAG:+$ENV_FLAG}"
echo "  - ${DESIGN_COMPOSE_ARGS[*]} logs teamver-design-api --tail 80"
if [[ -n "$NO_CACHE" ]]; then
  echo "  - 이미지가 반영 안 된 것 같으면: $0 --$TARGET_ENV --no-cache"
fi
