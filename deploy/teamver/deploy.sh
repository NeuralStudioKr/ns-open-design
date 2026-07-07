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

export DOCKER_CLIENT_TIMEOUT="${DOCKER_CLIENT_TIMEOUT:-300}"
export COMPOSE_HTTP_TIMEOUT="${COMPOSE_HTTP_TIMEOUT:-300}"

# PLAYWRIGHT_INSTALL_TOKEN cache-busts the deploy/Dockerfile install RUN
# so /ms-playwright is redownloaded every deploy. Without this, a
# previously cached-but-corrupt install layer can survive across
# deploys and re-produce the "headless Chromium unavailable" SIGTRAP
# path. Fall back to a timestamp when we cannot read a git SHA (e.g.
# on hosts running from a shallow tarball).
if [[ -z "${PLAYWRIGHT_INSTALL_TOKEN:-}" ]]; then
  PLAYWRIGHT_INSTALL_TOKEN="$(
    git -C "$OD_ROOT" rev-parse --short HEAD 2>/dev/null || date -u +%Y%m%dT%H%M%SZ
  )"
fi
export PLAYWRIGHT_INSTALL_TOKEN
echo "==> PLAYWRIGHT_INSTALL_TOKEN=${PLAYWRIGHT_INSTALL_TOKEN} (cache-bust /ms-playwright)"

# docs-teamver/39_2 · 39_5 — inject OD_NODE_ID from EC2 IMDS so daemon
# (/api/health nodeId + X-OD-Node-Id) and design-api (/healthz node_id +
# X-Design-Api-Node) share the same per-EC2 identifier. Local dev / non-
# EC2 hosts fall back to `hostname`. Explicit OD_NODE_ID wins.
resolve_node_id_from_imds() {
  local token=""
  token="$(
    curl -sS -m 2 -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
      -X PUT http://169.254.169.254/latest/api/token 2>/dev/null || true
  )"
  if [[ -n "$token" ]]; then
    curl -sS -m 2 -H "X-aws-ec2-metadata-token: $token" \
      http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || true
  fi
}

if [[ -z "${OD_NODE_ID:-}" ]]; then
  imds_instance_id="$(resolve_node_id_from_imds)"
  if [[ -n "$imds_instance_id" ]]; then
    OD_NODE_ID="$imds_instance_id"
    echo "==> OD_NODE_ID=$OD_NODE_ID (IMDS EC2 instance-id)"
  else
    OD_NODE_ID="$(hostname 2>/dev/null || echo unknown)"
    echo "==> OD_NODE_ID=$OD_NODE_ID (hostname fallback — non-EC2)"
  fi
else
  echo "==> OD_NODE_ID=$OD_NODE_ID (explicit override)"
fi
export OD_NODE_ID

# docs-teamver/39_3 §5.2 — derive Litestream replica path from the
# resolved node id so multi-node deployments own disjoint S3 prefixes
# (writer collision prevented). Explicit override wins. Sanitise the
# node id to lower-kebab so the S3 key stays predictable.
if [[ -z "${LITESTREAM_REPLICA_PATH:-}" ]]; then
  sanitized_node_id="$(printf '%s' "$OD_NODE_ID" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9-' '-' | sed -E 's/^-+//; s/-+$//')"
  if [[ -n "$sanitized_node_id" && "$sanitized_node_id" != "unknown" ]]; then
    LITESTREAM_REPLICA_PATH="litestream/${sanitized_node_id}/app.sqlite"
    echo "==> LITESTREAM_REPLICA_PATH=$LITESTREAM_REPLICA_PATH (per-node prefix)"
  else
    LITESTREAM_REPLICA_PATH="litestream/app.sqlite"
    echo "==> LITESTREAM_REPLICA_PATH=$LITESTREAM_REPLICA_PATH (legacy single-node)"
  fi
else
  echo "==> LITESTREAM_REPLICA_PATH=$LITESTREAM_REPLICA_PATH (explicit override)"
fi
export LITESTREAM_REPLICA_PATH

# docs-teamver/39_2 §4 — nginx userId hash routing needs peer EC2 :7456 reachable
# when multi-node. Pre-check peer list (dry-run) to bind docker publish host.
OD_DOCKER_PUBLISH_HOST="${OD_DOCKER_PUBLISH_HOST:-127.0.0.1}"
if [[ -x "$SCRIPT_DIR/scripts/render_od_daemon_peers_nginx.sh" ]]; then
  peer_preview="$(
    bash "$SCRIPT_DIR/scripts/render_od_daemon_peers_nginx.sh" --dry-run 2>/dev/null || true
  )"
  if grep -qE '^server [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:' <<< "$peer_preview"; then
    OD_DOCKER_PUBLISH_HOST="0.0.0.0"
    echo "==> OD_DOCKER_PUBLISH_HOST=0.0.0.0 (multi-node — peer OD daemon routing)"
  else
    echo "==> OD_DOCKER_PUBLISH_HOST=127.0.0.1 (single-node or no peers yet)"
  fi
fi
export OD_DOCKER_PUBLISH_HOST

if [[ -x "$SCRIPT_DIR/scripts/prepull_docker_base_images.sh" ]]; then
  bash "$SCRIPT_DIR/scripts/prepull_docker_base_images.sh" "$ENV_FILE" || {
    echo "❌ Base image pre-pull failed (Docker Hub/ECR network). 재시도 또는 .env 에 NODE_BASE_IMAGE/PYTHON_BASE_IMAGE 확인." >&2
    exit 1
  }
fi

COMPOSE_EXTRA_ARGS=()
if [[ "$USE_LOCAL_DB" == true ]]; then
  COMPOSE_EXTRA_ARGS+=(--profile local-db)
fi
if [[ "$USE_MINIO" == true ]]; then
  COMPOSE_EXTRA_ARGS+=(--profile minio)
fi

SERVICES=(open-design-daemon teamver-design-api litestream)
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

# Refresh nginx peer upstream (39_2 §4). Requires sudo on EC2.
if [[ -x "$SCRIPT_DIR/scripts/render_od_daemon_peers_nginx.sh" ]]; then
  if [[ -n "$(resolve_node_id_from_imds 2>/dev/null || true)" ]]; then
    if sudo -n true 2>/dev/null; then
      sudo bash "$SCRIPT_DIR/scripts/render_od_daemon_peers_nginx.sh" || \
        echo "⚠️ render_od_daemon_peers_nginx.sh failed (nginx peer list stale?)"
    else
      echo "==> Tip: sudo bash scripts/render_od_daemon_peers_nginx.sh after deploy (multi-node peer list)"
    fi
  fi
fi

wait_for_litestream_running() {
  local max_attempts=15
  echo "==> Waiting for Litestream app.sqlite replica (${max_attempts}x2s) …"
  for _ in $(seq 1 "$max_attempts"); do
    local running
    running="$(
      "${DESIGN_COMPOSE_ARGS[@]}" "${COMPOSE_EXTRA_ARGS[@]}" \
        ps --status running --services litestream 2>/dev/null || true
    )"
    if grep -qx 'litestream' <<< "$running"; then
      echo "✓ Litestream replica process running"
      sleep 3
      local litestream_logs
      litestream_logs="$(docker logs teamver-design-litestream --tail 50 2>&1 || true)"
      if grep -q 'attempt to write a readonly database' <<< "$litestream_logs"; then
        echo "❌ Litestream sync blocked: readonly database (compose teamver_od_data:/data must be RW, not :ro)"
        echo "$litestream_logs" | tail -8
        return 1
      fi
      if echo "$litestream_logs" | tail -8 | grep -qE 'AccessDenied|GetBucketLocation'; then
        echo "❌ Litestream S3 IAM — role에 s3:GetBucketLocation + litestream/* 필요 (doc 18 §3.1 · terraform s3.tf apply)"
        echo "$litestream_logs" | tail -8
        return 1
      fi
      return 0
    fi
    sleep 2
  done
  echo "❌ Litestream failed to stay running — app.sqlite would remain EBS-only"
  "${DESIGN_COMPOSE_ARGS[@]}" "${COMPOSE_EXTRA_ARGS[@]}" logs litestream --tail 80 || true
  return 1
}

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

wait_for_litestream_running
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
if [[ "$TARGET_ENV" == "staging" ]]; then
  echo "  - sudo bash devops/nginx/apply_teamver_design_staging_nginx_conf.sh \\"
  echo "      ./stg-design.teamver.com.https.conf --disable stg-design.teamver.com.http.conf"
elif [[ "$TARGET_ENV" == "production" ]]; then
  echo "  - sudo bash devops/nginx/apply_teamver_design_nginx_conf.sh ./design.teamver.com.http.conf"
fi
echo "  - ${DESIGN_COMPOSE_ARGS[*]} logs teamver-design-api --tail 80"
if [[ -n "$NO_CACHE" ]]; then
  echo "  - 이미지가 반영 안 된 것 같으면: $0 --$TARGET_ENV --no-cache"
fi
