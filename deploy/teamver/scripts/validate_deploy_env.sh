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

if [[ ! -f "$ROOT/$ENV_FILE" ]]; then
  echo "❌ $ROOT/$ENV_FILE 없음"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ROOT/$ENV_FILE"
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

if [[ -z "${TEAMVER_DESIGN_API_URL:-}" ]]; then
  warn "TEAMVER_DESIGN_API_URL 미설정 — daemon usage M2M 비활성"
fi

if [[ "${TRUST_TEAMVER_PROXY_HEADERS:-}" != "true" ]]; then
  warn "TRUST_TEAMVER_PROXY_HEADERS!=true — nginx identity 헤더 신뢰 비활성 (publish access gate 영향)"
fi

if [[ -z "${TEAMVER_OD_API_KEY:-}" && -z "${ANTHROPIC_API_KEY:-}" ]]; then
  warn "TEAMVER_OD_API_KEY·ANTHROPIC_API_KEY 모두 없음 — embed managed API/chat 비활성 (BYOK만)"
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
