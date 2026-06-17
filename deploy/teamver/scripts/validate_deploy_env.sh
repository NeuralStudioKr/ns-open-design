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
    --staging) ENV_FILE=".env.staging" ;;
    --production) ENV_FILE=".env.production" ;;
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

if [[ "${OD_PROJECT_STORAGE:-local}" == "s3" ]]; then
  require_nonempty OD_S3_BUCKET
  require_nonempty TEAMVER_DESIGN_API_URL
  if [[ -z "${OD_S3_REGION:-}" && -z "${AWS_REGION:-}" ]]; then
    fail "OD_PROJECT_STORAGE=s3 인데 OD_S3_REGION 또는 AWS_REGION 필요"
  fi
  if [[ -z "${TEAMVER_INTERNAL_API_KEY:-}" ]]; then
    fail "S3 + usage M2M: TEAMVER_INTERNAL_API_KEY 필요 (daemon → design-api)"
  fi
  if [[ -n "${OD_S3_ENDPOINT:-}" ]]; then
    if [[ "${OD_S3_ENDPOINT}" == *"minio"* || "${OD_S3_ENDPOINT}" == *"127.0.0.1"* || "${OD_S3_ENDPOINT}" == *"localhost"* ]]; then
      warn "OD_S3_ENDPOINT=${OD_S3_ENDPOINT} — MinIO/로컬 dev용; staging/prod EC2는 AWS 기본 endpoint 권장"
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
else
  warn "OD_PROJECT_STORAGE=${OD_PROJECT_STORAGE:-local} — staging Track A S3 격리는 s3 권장"
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
fi

if [[ "$errors" -gt 0 ]]; then
  echo
  echo "==> $errors error(s), $warnings warning(s) — fix $ENV_FILE 후 재시도"
  exit 1
fi

echo "✓ $ENV_FILE preflight OK ($warnings warning(s))"
if [[ "$WARN_ONLY" == true && "$warnings" -gt 0 ]]; then
  exit 0
fi
exit 0
