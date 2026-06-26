#!/usr/bin/env bash
# Teamver Design — storage isolation audit (staging/production).
#
# 한 번 호출로 다음을 확인한다:
#   1) .env 의 OD_PROJECT_STORAGE=s3 (local-disk fallback 금지)
#   2) docker-compose 가 daemon/design-api 컨테이너에 OD_PROJECT_STORAGE=s3 를 주입했는가
#   3) design-api /api/healthz/deps 가 config.project_storage=s3 + checks.od_storage=ok 인가
#   4) daemon /api/health/storage 가 mode=s3 + ok=true 인가
#   5) Drive publish 의존성 (Main BE drive credentials) 이 design-api 에 wired 됐는가
#   6) litestream sidecar LITESTREAM_BUCKET 이 OD_S3_BUCKET 과 일치하는가
#   7) litestream running + S3 replica 객체 (verify_litestream_replica.sh)
#
# 실패 시 exit 1. validate_deploy_env.sh / smoke_design.sh 둘이 다루지 못하는
# "compose up 이후 실제 컨테이너 ENV·헬스" 까지 묶어 한 화면에 표시한다.
#
# Usage:
#   bash scripts/check_storage_isolation.sh --staging
#   bash scripts/check_storage_isolation.sh --production
#   DESIGN_API_LOCAL_URL=http://127.0.0.1:16000 \
#   DAEMON_LOCAL_URL=http://127.0.0.1:7456 \
#   OD_API_TOKEN=$(grep ^OD_API_TOKEN= .env.staging | cut -d= -f2-) \
#     bash scripts/check_storage_isolation.sh --staging

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV_FILE=""
ENV_LABEL=""
DAEMON_CONTAINER="teamver-open-design-daemon"
API_CONTAINER="teamver-design-api"
LITESTREAM_CONTAINER="teamver-design-litestream"

usage() {
  cat <<'EOF'
check_storage_isolation.sh — Track A tenant 격리·내구성 audit

  bash scripts/check_storage_isolation.sh --staging
  bash scripts/check_storage_isolation.sh --production

ENV:
  DESIGN_API_LOCAL_URL   design-api loopback (default http://127.0.0.1:16000)
  DAEMON_LOCAL_URL       daemon loopback     (default http://127.0.0.1:7456)
  OD_API_TOKEN           daemon bearer token (default: parsed from .env)
  CHECK_CONTAINER_ENV    1 일 때 docker exec 으로 컨테이너 ENV 직접 검사 (default 1)
  CHECK_LITESTREAM_REPLICA 1 일 때 §7 Litestream S3 replica probe (default 1, staging/prod)
  CHECK_LITESTREAM_S3_PROBE 1 일 때 §7 에서 aws s3 ls (default 1; EC2 IAM 필요)
EOF
}

while (( $# )); do
  case "$1" in
    --staging) ENV_FILE=".env.staging"; ENV_LABEL=staging ;;
    --production) ENV_FILE=".env.production"; ENV_LABEL=production ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ -z "$ENV_FILE" ]]; then
  echo "❌ --staging 또는 --production 필요"
  usage
  exit 1
fi

ENV_PATH="$ROOT/$ENV_FILE"
if [[ ! -f "$ENV_PATH" ]]; then
  echo "❌ $ENV_PATH 없음 — cp $ENV_FILE.example $ENV_FILE 부터"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_PATH"
set +a

DESIGN_API_LOCAL_URL="${DESIGN_API_LOCAL_URL:-http://127.0.0.1:16000}"
DAEMON_LOCAL_URL="${DAEMON_LOCAL_URL:-http://127.0.0.1:7456}"
CHECK_CONTAINER_ENV="${CHECK_CONTAINER_ENV:-1}"

pass=0
fail=0
AUDIT_DEPS_OD_STORAGE=""
AUDIT_STORAGE_REASON=""

ok()   { echo "✓ $1"; pass=$((pass + 1)); }
nope() { echo "✗ $1"; fail=$((fail + 1)); }
skip() { echo "○ $1"; }

# --- 1) .env file --------------------------------------------------------
resolved_storage="$(printf '%s' "${OD_PROJECT_STORAGE:-local}" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ "$resolved_storage" == "s3" ]]; then
  ok "$ENV_FILE OD_PROJECT_STORAGE=s3"
else
  nope "$ENV_FILE OD_PROJECT_STORAGE=$resolved_storage (s3 required for $ENV_LABEL)"
fi

if [[ "${OD_S3_ALLOW_SCRATCH_FALLBACK:-0}" == "1" ]]; then
  nope "$ENV_FILE OD_S3_ALLOW_SCRATCH_FALLBACK=1 (staging/production must fail instead of local scratch fallback)"
else
  ok "$ENV_FILE OD_S3_ALLOW_SCRATCH_FALLBACK disabled"
fi

if [[ -n "${OD_S3_BUCKET:-}" ]]; then
  ok "$ENV_FILE OD_S3_BUCKET=$OD_S3_BUCKET"
else
  nope "$ENV_FILE OD_S3_BUCKET unset"
fi

s3_prefix="${OD_S3_PREFIX:-}"
if [[ -n "$s3_prefix" ]]; then
  ok "$ENV_FILE OD_S3_PREFIX=$s3_prefix"
  if [[ "$s3_prefix" == */ ]]; then
    ok "OD_S3_PREFIX trailing slash (tenant isolation prefix)"
  else
    nope "OD_S3_PREFIX=$s3_prefix (must end with / e.g. design/)"
  fi
else
  nope "$ENV_FILE OD_S3_PREFIX unset (tenant prefix required for workspace isolation)"
fi

if [[ -n "${OD_S3_BUCKET:-}" && -n "${LITESTREAM_BUCKET:-}" ]]; then
  if [[ "${LITESTREAM_BUCKET}" == "${OD_S3_BUCKET}" ]]; then
    ok "LITESTREAM_BUCKET matches OD_S3_BUCKET (app.sqlite replica co-located)"
  else
    nope "LITESTREAM_BUCKET=${LITESTREAM_BUCKET} != OD_S3_BUCKET=${OD_S3_BUCKET} (sqlite replica must use project bucket)"
  fi
elif [[ -n "${OD_S3_BUCKET:-}" ]]; then
  skip "LITESTREAM_BUCKET unset (Litestream replica optional in dev)"
fi

# --- 2) 컨테이너 ENV (docker exec) --------------------------------------
container_storage_check() {
  local container="$1"
  local label="$2"
  if ! command -v docker >/dev/null 2>&1; then
    skip "$label container ENV check skipped (docker not available)"
    return
  fi
  if ! docker inspect "$container" >/dev/null 2>&1; then
    nope "$label container '$container' not running (docker compose up?)"
    return
  fi
  local actual
  actual="$(docker exec "$container" sh -lc 'printf "%s" "${OD_PROJECT_STORAGE:-local}"' 2>/dev/null || echo "")"
  actual="$(printf '%s' "$actual" | tr '[:upper:]' '[:lower:]' | xargs)"
  if [[ "$actual" == "s3" ]]; then
    ok "$label container OD_PROJECT_STORAGE=s3"
  else
    nope "$label container OD_PROJECT_STORAGE=$actual (compose 가 .env 를 못 읽었거나 default :-local 에 떨어짐)"
  fi
  local prefix
  prefix="$(docker exec "$container" sh -lc 'printf "%s" "${OD_S3_PREFIX:-}"' 2>/dev/null || echo "")"
  if [[ -n "$prefix" ]]; then
    if [[ "$prefix" == */ ]]; then
      ok "$label container OD_S3_PREFIX=$prefix"
    else
      nope "$label container OD_S3_PREFIX=$prefix (must end with / e.g. design/)"
    fi
  else
    nope "$label container OD_S3_PREFIX unset"
  fi
  local bucket
  bucket="$(docker exec "$container" sh -lc 'printf "%s" "${OD_S3_BUCKET:-}"' 2>/dev/null || echo "")"
  if [[ -n "$bucket" && -n "${OD_S3_BUCKET:-}" ]]; then
    if [[ "$bucket" == "${OD_S3_BUCKET}" ]]; then
      ok "$label container OD_S3_BUCKET=$bucket"
    else
      nope "$label container OD_S3_BUCKET=$bucket != .env OD_S3_BUCKET=${OD_S3_BUCKET}"
    fi
  elif [[ -n "${OD_S3_BUCKET:-}" ]]; then
    nope "$label container OD_S3_BUCKET unset (.env=${OD_S3_BUCKET})"
  fi
  if [[ "$container" == "$DAEMON_CONTAINER" ]]; then
    local purge env_purge
    purge="$(docker exec "$container" sh -lc 'printf "%s" "${OD_S3_PURGE_ON_DELETE:-}"' 2>/dev/null || echo "")"
    env_purge="${OD_S3_PURGE_ON_DELETE:-}"
    if [[ -z "${env_purge//[[:space:]]/}" ]]; then
      nope "$label OD_S3_PURGE_ON_DELETE unset in .env (hosted must set =0 — validate_deploy_env)"
    elif [[ "$purge" != "$env_purge" ]]; then
      nope "$label container OD_S3_PURGE_ON_DELETE=${purge:-<unset>} (.env=${env_purge} — redeploy daemon)"
    elif [[ "$env_purge" == "0" ]]; then
      ok "$label container OD_S3_PURGE_ON_DELETE=0 (S3 retain on delete — Teamver standard)"
    else
      skip "$label container OD_S3_PURGE_ON_DELETE=${env_purge} (S3 purge on delete — legal erasure mode)"
    fi
  fi
}

container_litestream_bucket_check() {
  if ! command -v docker >/dev/null 2>&1; then
    skip "litestream container ENV check skipped (docker not available)"
    return
  fi
  if ! docker inspect "$LITESTREAM_CONTAINER" >/dev/null 2>&1; then
    if [[ "$ENV_LABEL" == "staging" || "$ENV_LABEL" == "production" ]]; then
      nope "litestream container '$LITESTREAM_CONTAINER' not running (deploy.sh hosted gate)"
    else
      skip "litestream container '$LITESTREAM_CONTAINER' not running"
    fi
    return
  fi
  local state
  state="$(docker inspect -f '{{.State.Status}}' "$LITESTREAM_CONTAINER" 2>/dev/null || echo unknown)"
  if [[ "$state" != "running" ]]; then
    nope "litestream container state=$state (expected running)"
    return
  fi
  local bucket
  bucket="$(docker exec "$LITESTREAM_CONTAINER" sh -lc 'printf "%s" "${LITESTREAM_BUCKET:-}"' 2>/dev/null || echo "")"
  if [[ -z "$bucket" ]]; then
    nope "litestream container LITESTREAM_BUCKET unset"
    return
  fi
  if [[ -n "${OD_S3_BUCKET:-}" && "$bucket" == "${OD_S3_BUCKET}" ]]; then
    ok "litestream container LITESTREAM_BUCKET=$bucket (matches OD_S3_BUCKET)"
  elif [[ -n "${OD_S3_BUCKET:-}" ]]; then
    nope "litestream container LITESTREAM_BUCKET=$bucket != OD_S3_BUCKET=${OD_S3_BUCKET}"
  else
    ok "litestream container LITESTREAM_BUCKET=$bucket"
  fi
  local sync_iv
  sync_iv="$(docker exec "$LITESTREAM_CONTAINER" sh -lc 'printf "%s" "${LITESTREAM_SYNC_INTERVAL:-}"' 2>/dev/null || echo "")"
  if [[ -n "$sync_iv" ]]; then
    ok "litestream container LITESTREAM_SYNC_INTERVAL=$sync_iv"
  fi
}

if [[ "$CHECK_CONTAINER_ENV" == "1" ]]; then
  container_storage_check "$DAEMON_CONTAINER" "OD daemon"
  container_storage_check "$API_CONTAINER" "design-api"
  container_litestream_bucket_check
fi

# --- 3) design-api /api/healthz/deps ------------------------------------
deps_json="$(curl -sf --max-time 8 "${DESIGN_API_LOCAL_URL}/api/healthz/deps" 2>/dev/null || echo "")"
if [[ -n "$deps_json" ]]; then
  deps_storage="$(printf '%s' "$deps_json" | sed -n 's/.*"project_storage":"\([^"]*\)".*/\1/p' | head -1)"
  deps_od_storage="$(printf '%s' "$deps_json" | sed -n 's/.*"od_storage":"\([^"]*\)".*/\1/p' | head -1)"
  AUDIT_DEPS_OD_STORAGE="$deps_od_storage"
  deps_db="$(printf '%s' "$deps_json" | sed -n 's/.*"db":"\([^"]*\)".*/\1/p' | head -1)"
  if [[ "$deps_storage" == "s3" ]]; then
    ok "design-api deps config.project_storage=s3"
  else
    nope "design-api deps config.project_storage=$deps_storage (expected s3)"
  fi
  if [[ "$deps_od_storage" == "ok" ]]; then
    ok "design-api deps checks.od_storage=ok (S3 reachability OK)"
  else
    nope "design-api deps checks.od_storage=$deps_od_storage (daemon /api/health/storage 가 ok:true 아님 — IAM·bucket·creds 확인)"
  fi
  if [[ "$deps_db" == "ok" ]]; then
    ok "design-api deps checks.db=ok (RDS 연결)"
  else
    nope "design-api deps checks.db=$deps_db (RDS/SSL 확인)"
  fi
else
  nope "design-api ${DESIGN_API_LOCAL_URL}/api/healthz/deps unreachable"
fi

# --- 4) daemon /api/health/storage --------------------------------------
storage_headers=()
if [[ -n "${OD_API_TOKEN:-}" ]]; then
  storage_headers=(-H "Authorization: Bearer ${OD_API_TOKEN}")
fi
storage_json="$(curl -s --max-time 8 "${storage_headers[@]}" "${DAEMON_LOCAL_URL}/api/health/storage" 2>/dev/null || echo "")"
if [[ -n "$storage_json" ]]; then
  storage_mode="$(printf '%s' "$storage_json" | sed -n 's/.*"mode":"\([^"]*\)".*/\1/p' | head -1)"
  storage_ok="$(printf '%s' "$storage_json" | sed -n 's/.*"ok":\(true\|false\).*/\1/p' | head -1)"
  if [[ "$storage_mode" == "s3" ]]; then
    ok "daemon /api/health/storage mode=s3"
  else
    nope "daemon /api/health/storage mode=$storage_mode (expected s3; local-disk SSOT 사용 중)"
  fi
  if [[ "$storage_ok" == "true" ]]; then
    ok "daemon /api/health/storage ok=true"
  else
    storage_reason="$(printf '%s' "$storage_json" | sed -n 's/.*"reason":"\([^"]*\)".*/\1/p' | head -1)"
    AUDIT_STORAGE_REASON="$storage_reason"
    nope "daemon /api/health/storage ok=$storage_ok reason=${storage_reason:-?}"
  fi
else
  nope "daemon ${DAEMON_LOCAL_URL}/api/health/storage unreachable (OD_API_TOKEN 필요?)"
fi

# --- 5) Drive publish wiring (Main BE) ----------------------------------
api_base_url="${TEAMVER_API_BASE_URL:-}"
if [[ -n "$api_base_url" ]]; then
  ok "design-api → Main BE TEAMVER_API_BASE_URL=$api_base_url (Drive presigned upload 경로)"
else
  nope "TEAMVER_API_BASE_URL 미설정 — Drive publish 가 동작하지 않음"
fi
if [[ -n "${TEAMVER_DRIVE_PUBLISH_FOLDER_ID:-}" ]]; then
  ok "Drive publish 폴더 격리됨 (TEAMVER_DRIVE_PUBLISH_FOLDER_ID set)"
else
  skip "TEAMVER_DRIVE_PUBLISH_FOLDER_ID 미설정 — Drive 루트로 fallback (선택)"
fi

# --- 6) Local-disk SSOT 의심 신호 ---------------------------------------
# OD daemon 컨테이너에서 /app/.od/projects 의 실제 마운트 경로가 tmpfs 가
# 아닌 docker volume 이라면 scratch 가 그 자리이고 이는 정상. 그러나
# `local` mode 였다면 ssot 가 그 디렉토리이므로 .env 잘못된 신호.
if command -v docker >/dev/null 2>&1 && docker inspect "$DAEMON_CONTAINER" >/dev/null 2>&1; then
  scratch_in_compose="$(docker exec "$DAEMON_CONTAINER" sh -lc 'printf "%s" "${OD_SCRATCH_DIR:-}"' 2>/dev/null || true)"
  if [[ -n "$scratch_in_compose" ]]; then
    ok "daemon scratch dir: $scratch_in_compose"
  else
    skip "OD_SCRATCH_DIR unset (default /app/.od/scratch)"
  fi
fi

# --- 7) Litestream S3 replica (G2 / P2-1) ---------------------------------
if [[ "${CHECK_LITESTREAM_REPLICA:-1}" == "1" && ( "$ENV_LABEL" == "staging" || "$ENV_LABEL" == "production" ) ]]; then
  echo
  echo "==> Litestream replica (G2)"
  litestream_probe_env=()
  if [[ "${CHECK_LITESTREAM_S3_PROBE:-1}" != "1" ]]; then
    litestream_probe_env=(SKIP_S3_PROBE=1)
  fi
  if ! env "${litestream_probe_env[@]}" bash "$ROOT/scripts/verify_litestream_replica.sh" "--$ENV_LABEL"; then
    fail=$((fail + 1))
  fi
fi

echo
echo "==> $pass passed, $fail failed"
if (( fail > 0 )); then
  echo
  echo "Storage isolation FAILED — 사용자 파일이 local-disk 에 남거나 다음 deploy 에서"
  echo "유실될 수 있습니다. .env / docker-compose / IAM·bucket 을 확인하세요."
  if [[ "$AUDIT_DEPS_OD_STORAGE" == "degraded" || "$AUDIT_STORAGE_REASON" != "" ]]; then
    echo
    echo "S3 triage (docs-teamver/18_EC2_IAM_Instance_Profile_S3_설정.md):"
    case "${AUDIT_STORAGE_REASON:-}" in
      storage_not_initialized)
        echo "  · daemon S3 backend 미초기화 — compose up·daemon crash loop·OD_S3_* env 확인"
        ;;
      probe_timeout)
        echo "  · S3 probe timeout — bucket/region/network·security group 확인"
        ;;
    esac
    if [[ "${AUDIT_STORAGE_REASON:-}" == *AccessDenied* || "${AUDIT_STORAGE_REASON:-}" == *Forbidden* ]]; then
      echo "  · IAM policy: OD_S3_BUCKET/OD_S3_PREFIX vs instance profile scope (§3)"
    fi
    if [[ "${AUDIT_STORAGE_REASON:-}" == *credentials* || "${AUDIT_STORAGE_REASON:-}" == *accessKeyId* || "${AUDIT_STORAGE_REASON:-}" == *Credential* ]]; then
      echo "  · 컨테이너 creds: EC2 instance profile + IMDS hop limit=2 (§5-4, §7-3)"
    fi
    echo "  · loopback: curl -H \"Authorization: Bearer \$OD_API_TOKEN\" ${DAEMON_LOCAL_URL}/api/health/storage"
    echo "  · container IMDS: docker exec ${DAEMON_CONTAINER} … (doc §7-3)"
  fi
  exit 1
fi
echo "Storage isolation OK — daemon SSOT=S3, design-api SSOT=RDS, Drive publish=Main BE Drive"
exit 0
