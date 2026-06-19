#!/usr/bin/env bash
# Preflight checks for Teamver Design deploy env (.env.staging / .env.production).
#
# Usage:
#   bash scripts/validate_deploy_env.sh --staging
#   bash scripts/validate_deploy_env.sh --staging --rds
#   bash scripts/validate_deploy_env.sh --production --rds
#
# Called automatically from run_docker.sh (skip with --skip-validate).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV_FILE=""
USE_RDS=false
WARN_ONLY=false
ENV_FILE_PATH_OVERRIDE=""
DEPLOY_ENV_FLAG=""

usage() {
  cat <<'EOF'
validate_deploy_env.sh — required env keys before docker compose up

  bash scripts/validate_deploy_env.sh --staging [--rds]
  bash scripts/validate_deploy_env.sh --production [--rds]

Exit 1 when required keys are missing or invalid.
EOF
}

while (( $# )); do
  case "$1" in
    --staging) ENV_FILE=".env.staging"; DEPLOY_ENV_FLAG=--staging ;;
    --production) ENV_FILE=".env.production"; DEPLOY_ENV_FLAG=--production ;;
    --rds) USE_RDS=true ;;
    --warn-only) WARN_ONLY=true ;;
    --env-file)
      shift
      if [[ $# -eq 0 ]]; then
        echo "❌ --env-file requires path"
        exit 1
      fi
      ENV_FILE_PATH_OVERRIDE="$1"
      ENV_FILE="${ENV_FILE:-$(basename "$ENV_FILE_PATH_OVERRIDE")}"
      ;;
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

ENV_FILE_PATH="${ENV_FILE_PATH_OVERRIDE:-$ROOT/$ENV_FILE}"

if [[ ! -f "$ENV_FILE_PATH" ]]; then
  echo "❌ $ENV_FILE_PATH 없음"
  exit 1
fi

# Parent-shell exports must not shadow the selected env file (CI, operator exports, tests).
unset TEAMVER_OD_API_KEY ANTHROPIC_API_KEY OPENAI_API_KEY \
  OD_API_TOKEN TEAMVER_JWT_SECRET TEAMVER_INTERNAL_API_KEY \
  TEAMVER_API_BASE_URL TEAMVER_DESIGN_API_URL \
  OD_PROJECT_STORAGE OD_S3_BUCKET OD_S3_REGION AWS_REGION \
  OD_S3_ENDPOINT OD_S3_ACCESS_KEY_ID AWS_ACCESS_KEY_ID \
  OD_S3_ALLOW_SCRATCH_FALLBACK \
  POSTGRES_HOST POSTGRES_PASSWD POSTGRES_DB POSTGRES_USER \
  TEAMVER_REGISTRY_APP_ID TEAMVER_REGISTRY_KEY_ID TEAMVER_REGISTRY_ACCESS_KEY \
  LITESTREAM_BUCKET TEAMVER_DRIVE_PUBLISH_FOLDER_ID \
  TRUST_TEAMVER_PROXY_HEADERS TEAMVER_BILLING_DISABLED

# shellcheck disable=SC1090
set -a
source "$ENV_FILE_PATH"
set +a

errors=0
warnings=0

fail() {
  echo "❌ $1"
  errors=$((errors + 1))
}

warn() {
  echo "⚠ $1"
  warnings=$((warnings + 1))
}

require_nonempty() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value// }" ]]; then
    fail "$name 가 비어 있습니다 ($ENV_FILE)"
  fi
}

require_nonempty OD_API_TOKEN
require_nonempty TEAMVER_JWT_SECRET
require_nonempty TEAMVER_INTERNAL_API_KEY
require_nonempty TEAMVER_API_BASE_URL
require_nonempty POSTGRES_HOST
require_nonempty POSTGRES_PASSWD
require_nonempty POSTGRES_DB
require_nonempty POSTGRES_USER

if [[ "$USE_RDS" == true ]]; then
  if [[ "${POSTGRES_HOST:-}" == "design-db" ]]; then
    fail "POSTGRES_HOST=design-db — --rds 모드에서는 RDS endpoint 필요"
  fi
fi

# Project storage isolation — Teamver Track A 는 모든 프로젝트 파일이 tenant-scoped
# S3 prefix 에만 머물러야 한다. local-disk fallback 은 multi-tenant 격리·내구성을
#둘 다 깨므로 staging/production .env 에서 명시적으로 `OD_PROJECT_STORAGE=s3` 가
# 아니면 즉시 실패한다. docker-compose 의 `${OD_PROJECT_STORAGE:-local}` default
# 가 누락된 .env 를 silently local mode 로 떨어뜨리는 사고를 막는다.
RESOLVED_PROJECT_STORAGE="$(printf '%s' "${OD_PROJECT_STORAGE:-local}" | tr '[:upper:]' '[:lower:]' | xargs)"
case "$ENV_FILE" in
  .env.staging|.env.production) REQUIRE_S3_STORAGE=true ;;
  *) REQUIRE_S3_STORAGE=false ;;
esac

if [[ "$RESOLVED_PROJECT_STORAGE" == "s3" ]]; then
  require_nonempty OD_S3_BUCKET
  require_nonempty TEAMVER_DESIGN_API_URL
  if [[ "$REQUIRE_S3_STORAGE" == true && "${OD_S3_ALLOW_SCRATCH_FALLBACK:-0}" == "1" ]]; then
    fail "OD_S3_ALLOW_SCRATCH_FALLBACK=1 — staging/production 은 S3 초기화 실패 시 scratch-only fallback 금지"
  fi
  if [[ -z "${OD_S3_REGION:-}" && -z "${AWS_REGION:-}" ]]; then
    fail "OD_PROJECT_STORAGE=s3 인데 OD_S3_REGION 또는 AWS_REGION 필요"
  fi
  if [[ -z "${TEAMVER_INTERNAL_API_KEY:-}" ]]; then
    fail "S3 + usage M2M: TEAMVER_INTERNAL_API_KEY 필요 (daemon → design-api)"
  fi
  if [[ -n "${OD_S3_ENDPOINT:-}" ]]; then
    if [[ "${OD_S3_ENDPOINT}" == *"minio"* || "${OD_S3_ENDPOINT}" == *"127.0.0.1"* || "${OD_S3_ENDPOINT}" == *"localhost"* ]]; then
      if [[ "$REQUIRE_S3_STORAGE" == true ]]; then
        fail "OD_S3_ENDPOINT=${OD_S3_ENDPOINT} — MinIO/로컬 dev endpoint 는 staging/production 에서 금지 (AWS S3 endpoint 사용)"
      else
        warn "OD_S3_ENDPOINT=${OD_S3_ENDPOINT} — MinIO/로컬 dev용; staging/prod EC2는 AWS 기본 endpoint 권장"
      fi
    else
      warn "OD_S3_ENDPOINT 설정됨 — custom S3-compatible endpoint (의도 확인)"
    fi
  fi
  if [[ "${OD_S3_FORCE_PATH_STYLE:-}" == "true" || "${OD_S3_FORCE_PATH_STYLE:-}" == "1" ]]; then
    warn "OD_S3_FORCE_PATH_STYLE=true — MinIO typical; AWS S3 prod에서는 보통 불필요"
  fi
  if [[ -z "${OD_S3_ACCESS_KEY_ID:-}" && -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
    warn "OD_S3_ACCESS_KEY_ID·AWS_ACCESS_KEY_ID 없음 — EC2 instance role(IAM) 사용 가정"
  fi
elif [[ "$REQUIRE_S3_STORAGE" == true ]]; then
  fail "OD_PROJECT_STORAGE=${OD_PROJECT_STORAGE:-local} — $ENV_FILE 는 반드시 OD_PROJECT_STORAGE=s3 필요 (Teamver tenant 격리·내구성). bash scripts/apply_staging_s3_env.sh 또는 print_staging_s3_env.sh 참조."
else
  warn "OD_PROJECT_STORAGE=${OD_PROJECT_STORAGE:-local} — dev mode (laptop) 에서만 허용"
fi

if [[ -n "${TEAMVER_DESIGN_API_URL:-}" ]]; then
  warn "TEAMVER_DESIGN_API_URL 설정됨 — daemon이 folder import/linkedDirs 차단 (check_sidecar_deps 게이트 probe)"
else
  warn "TEAMVER_DESIGN_API_URL 미설정 — daemon usage M2M·embed folder gates 비활성"
fi

if [[ "${TRUST_TEAMVER_PROXY_HEADERS:-}" != "true" ]]; then
  warn "TRUST_TEAMVER_PROXY_HEADERS!=true — nginx identity 헤더 신뢰 비활성 (publish access gate 영향)"
fi

if [[ -z "${TEAMVER_OD_API_KEY:-}" && -z "${ANTHROPIC_API_KEY:-}" ]]; then
  warn "TEAMVER_OD_API_KEY·ANTHROPIC_API_KEY 모두 없음 — embed managed API/chat 비활성 (BYOK만)"
fi

# Staging embed — managed runtime-config (Settings BYOK 숨김) 에 TEAMVER_OD_API_KEY 필수.
if [[ "$ENV_FILE" == ".env.staging" ]]; then
  if [[ -z "${TEAMVER_OD_API_KEY:-}" ]]; then
    fail "staging embed: TEAMVER_OD_API_KEY 필요 — /api/v1/runtime-config configured=true (사용자 Settings BYOK 비활성)"
  fi
fi

# ---------------------------------------------------------------------------
# loop 142 — .env.production hard guards (실서비스 오픈 게이트)
# Production 만 강제: managed API/daemon LLM 키 하나는 필수, 정적 AWS 키 금지
# (instance profile only), Litestream/Drive folder 권장 (warn).
# Staging/dev 는 warn 만 유지해 개발 마찰을 줄인다.
# ---------------------------------------------------------------------------
if [[ "$ENV_FILE" == ".env.production" ]]; then
  # G7 — managed API (TEAMVER_OD_API_KEY) 또는 daemon LLM key (ANTHROPIC/OPENAI)
  # 둘 다 누락이면 embed 가 BYOK 만 가능 → public 사용자가 키 없이 chat 불가.
  has_managed_key=false
  has_daemon_llm=false
  [[ -n "${TEAMVER_OD_API_KEY:-}" ]] && has_managed_key=true
  if [[ -n "${ANTHROPIC_API_KEY:-}" || -n "${OPENAI_API_KEY:-}" ]]; then
    has_daemon_llm=true
  fi
  if [[ "$has_managed_key" != true && "$has_daemon_llm" != true ]]; then
    fail "production: TEAMVER_OD_API_KEY (managed) 또는 ANTHROPIC_API_KEY/OPENAI_API_KEY (daemon) 중 최소 하나 필요 — 공개 사용자 chat 게이트"
  fi

  # G6 — Production 은 instance profile 만. 정적 AWS access key 가 깔리면
  # 회전·감사·로컬 유출 위험. override: ALLOW_STATIC_AWS_KEYS=1 (긴급용).
  if [[ -n "${OD_S3_ACCESS_KEY_ID:-}" || -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
    if [[ "${ALLOW_STATIC_AWS_KEYS:-0}" == "1" ]]; then
      warn "production: 정적 AWS key 사용 (ALLOW_STATIC_AWS_KEYS=1) — IAM instance profile 회수 후 즉시 키도 회수 권장"
    else
      fail "production: OD_S3_ACCESS_KEY_ID/AWS_ACCESS_KEY_ID 설정됨 — EC2 IAM instance profile 만 허용 (긴급 우회: ALLOW_STATIC_AWS_KEYS=1)"
    fi
  fi

  # G2 — Litestream replica 없이 prod 진입 시 app.sqlite 손실 시 메타 복구
  # 불가. 강제는 하지 않지만 명시적 경고.
  if [[ -z "${LITESTREAM_BUCKET:-}" ]]; then
    warn "production: LITESTREAM_BUCKET 미설정 — app.sqlite Litestream replica 비활성 (P2-1; restore_app_sqlite_from_s3.sh 미가용)"
  fi

  # G7 — Drive publish folder 없이 prod 진입 시 publish 가 Drive root 에 떨어짐
  # (multi-workspace 격리 위반). example 가이드에 따라 staging/prod 는 폴더 권장.
  if [[ -z "${TEAMVER_DRIVE_PUBLISH_FOLDER_ID:-}" ]]; then
    warn "production: TEAMVER_DRIVE_PUBLISH_FOLDER_ID 미설정 — publish 가 Drive root 에 업로드됨 (Phase 4 G7 권장)"
  fi

  # E2E sanity — production 은 BYOK chat 만으로도 동작하지만 OD_API_TOKEN
  # 기본값이 staging 과 같으면 token leakage 위험.
  if [[ -n "${OD_API_TOKEN:-}" && "${OD_API_TOKEN}" == *"staging"* ]]; then
    fail "production: OD_API_TOKEN 값에 'staging' 포함 — staging 토큰 재사용 의심, prod 전용 토큰 발급 필요"
  fi
fi

# Registry billing (Phase 2) — Admin 발급. All-or-nothing.
registry_set_count=0
[[ -n "${TEAMVER_REGISTRY_APP_ID:-}" ]] && registry_set_count=$((registry_set_count + 1))
[[ -n "${TEAMVER_REGISTRY_KEY_ID:-}" ]] && registry_set_count=$((registry_set_count + 1))
[[ -n "${TEAMVER_REGISTRY_ACCESS_KEY:-}" ]] && registry_set_count=$((registry_set_count + 1))
if [[ "$registry_set_count" -gt 0 && "$registry_set_count" -lt 3 ]]; then
  fail "TEAMVER_REGISTRY_APP_ID/KEY_ID/ACCESS_KEY 부분 설정 — 셋 모두 또는 셋 모두 비워야 함 (run_lifecycle은 셋 모두 있을 때만 reserve/commit 호출)"
elif [[ "$registry_set_count" -eq 3 ]]; then
  warn "TEAMVER_REGISTRY_* 설정됨 — design run reserve/commit/refund 활성 (CW alarm: teamver_usage_5xx)"
else
  warn "TEAMVER_REGISTRY_* 미설정 — Registry billing Phase 2 skip (run_lifecycle best-effort no-op)"
fi

# Drive publish (Phase 4 / G7) — Teamver Drive 업로드 폴더.
# `TEAMVER_DRIVE_PUBLISH_FOLDER_ID` 미설정 시 design-api PublishService는
# Drive 루트로 fallback. staging/prod에서는 격리된 폴더가 권장.
if [[ -z "${TEAMVER_DRIVE_PUBLISH_FOLDER_ID:-}" ]]; then
  warn "TEAMVER_DRIVE_PUBLISH_FOLDER_ID 미설정 — Drive publish는 루트 폴더로 업로드됨 (Phase 4 격리 권장)"
else
  warn "TEAMVER_DRIVE_PUBLISH_FOLDER_ID 설정됨 — design-api PublishService가 해당 폴더로 export 업로드 (G7)"
fi

# Daemon Registry billing bridge (Phase 2 / 09 §3 / A9) — daemon이 chat run
# 시작 시 design-api `/api/internal/billing/{reserve,commit,refund}`를 호출.
if [[ "${TEAMVER_BILLING_DISABLED:-}" == "1" ]]; then
  warn "TEAMVER_BILLING_DISABLED=1 — daemon billing bridge OFF (run lifecycle reserve/commit/refund 호출 안 함)"
elif [[ -n "${TEAMVER_DESIGN_API_URL:-}" && -n "${TEAMVER_INTERNAL_API_KEY:-}" ]]; then
  warn "daemon billing bridge 활성 — design-api 응답 usage_id=null 이면 best-effort skip (registry creds 미설정 시 안전)"
else
  warn "daemon billing bridge OFF — TEAMVER_DESIGN_API_URL·TEAMVER_INTERNAL_API_KEY 미설정"
fi

# Scratch eviction (P1-10 / P1-6) — daemon scratch 용량 관리.
if [[ "${OD_PROJECT_STORAGE:-local}" == "s3" ]]; then
  if [[ "${OD_SCRATCH_EVICT_AFTER_RUN:-}" == "1" ]]; then
    warn "OD_SCRATCH_EVICT_AFTER_RUN=1 — run 종료 후 scratch project tree 제거 (디스크 절약, 다음 access는 sync-down)"
  else
    warn "OD_SCRATCH_EVICT_AFTER_RUN 미설정 — scratch는 lazy TTL/디스크 알람으로만 관리됨"
  fi
  if [[ -z "${OD_S3_SYNC_UP_METRICS:-}" || "${OD_S3_SYNC_UP_METRICS}" != "1" ]]; then
    warn "OD_S3_SYNC_UP_METRICS!=1 — lazy/run-end sync-up failed JSON 마커가 비활성 (CW od_s3_sync_up_failed 알람 영향 없음 — run-end는 항상 emit)"
  fi
  if [[ "${OD_SCRATCH_DISK_METRICS:-}" == "1" ]]; then
    warn "OD_SCRATCH_DISK_METRICS=1 — run 종료 시 od_scratch_disk_usage JSON 마커 emit (threshold MB=${OD_SCRATCH_DISK_THRESHOLD_MB:-2048}, periodic interval ms=${OD_SCRATCH_DISK_METRIC_INTERVAL_MS:-300000})"
  else
    warn "OD_SCRATCH_DISK_METRICS!=1 — scratch 디스크 사용량 마커 비활성 (CW od_scratch_disk_usage 알람 무효)"
  fi
  if [[ "${OD_S3_PURGE_ON_DELETE:-}" == "0" ]]; then
    warn "OD_S3_PURGE_ON_DELETE=0 — registry delete 시 tenant S3 prefix 유지 (scratch evict만)"
  else
    warn "OD_S3_PURGE_ON_DELETE 활성 — registry delete/scratch/evict 시 tenant S3 prefix 객체 purge (od_s3_remote_purged 마커)"
  fi
fi

if [[ "$errors" -gt 0 ]]; then
  echo
  echo "==> $errors error(s), $warnings warning(s) — fix $ENV_FILE 후 재시도"
  exit 1
fi

echo "✓ $ENV_FILE preflight OK ($warnings warning(s))"
if [[ -n "$DEPLOY_ENV_FLAG" ]]; then
  warn "Main BE design-api wiring — bash scripts/check_main_be_design_wiring.sh $DEPLOY_ENV_FLAG (A6)"
fi
if [[ "$WARN_ONLY" == true && "$warnings" -gt 0 ]]; then
  exit 0
fi
exit 0
