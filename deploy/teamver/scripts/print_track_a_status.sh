#!/usr/bin/env bash
# Track A integration status — .env flags + optional remote health probes.
#
# Usage:
#   bash scripts/print_track_a_status.sh --staging
#   bash scripts/print_track_a_status.sh --staging --probe
#   OD_PROJECT_STORAGE=s3 bash scripts/print_track_a_status.sh --staging --probe

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE=""
PROBE=0

DESIGN_HOST="${DESIGN_HOST:-}"
DESIGN_API_HOST="${DESIGN_API_HOST:-}"

usage() {
  sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
}

while (( $# )); do
  case "$1" in
    --staging)
      ENV_FILE=".env.staging"
      DESIGN_HOST="${DESIGN_HOST:-stg-design.teamver.com}"
      DESIGN_API_HOST="${DESIGN_API_HOST:-stg-design-api.teamver.com}"
      ;;
    --production)
      ENV_FILE=".env.production"
      DESIGN_HOST="${DESIGN_HOST:-design.teamver.com}"
      DESIGN_API_HOST="${DESIGN_API_HOST:-design-api.teamver.com}"
      ;;
    --probe) PROBE=1 ;;
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

flag() {
  local label="$1"
  local value="${2:-}"
  if [[ -n "${value// }" ]]; then
    printf "  ✓ %-28s %s\n" "$label" "$value"
  else
    printf "  ○ %-28s (unset)\n" "$label"
  fi
}

echo "==> Track A status ($ENV_FILE)"
if [[ -f "$ROOT/$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ROOT/$ENV_FILE"
  set +a
  echo "    env file: $ROOT/$ENV_FILE"
else
  echo "    env file: missing — using process env only"
fi
echo

storage="${OD_PROJECT_STORAGE:-local}"
storage="$(printf '%s' "$storage" | tr '[:upper:]' '[:lower:]')"
echo "Storage & registry"
flag "OD_PROJECT_STORAGE" "$storage"
if [[ "$storage" == "s3" ]]; then
  flag "OD_S3_BUCKET" "${OD_S3_BUCKET:-}"
  flag "OD_S3_REGION" "${OD_S3_REGION:-${AWS_REGION:-}}"
  flag "OD_S3_PREFIX" "${OD_S3_PREFIX:-}"
  if [[ -n "${OD_S3_ENDPOINT:-}" ]]; then
    flag "OD_S3_ENDPOINT" "${OD_S3_ENDPOINT} (MinIO/dev)"
  fi
fi
flag "TEAMVER_DESIGN_API_URL" "${TEAMVER_DESIGN_API_URL:-}"
flag "TRUST_TEAMVER_PROXY_HEADERS" "${TRUST_TEAMVER_PROXY_HEADERS:-}"
echo

echo "Auth & embed"
flag "TEAMVER_API_BASE_URL" "${TEAMVER_API_BASE_URL:-}"
flag "TEAMVER_INTERNAL_API_KEY" "$([[ -n "${TEAMVER_INTERNAL_API_KEY:-}" ]] && echo set || true)"
flag "TEAMVER_OD_API_KEY" "$([[ -n "${TEAMVER_OD_API_KEY:-}" ]] && echo set || true)"
flag "ANTHROPIC_API_KEY" "$([[ -n "${ANTHROPIC_API_KEY:-}" ]] && echo set || true)"
flag "OD_API_TOKEN" "$([[ -n "${OD_API_TOKEN:-}" ]] && echo set || true)"
echo

echo "Postgres"
flag "POSTGRES_HOST" "${POSTGRES_HOST:-}"
flag "POSTGRES_DB" "${POSTGRES_DB:-}"
echo

if [[ "$PROBE" -eq 0 ]]; then
  echo "Tip: --probe 로 stg-design* health curl 추가"
  exit 0
fi

if [[ -z "$DESIGN_HOST" || -z "$DESIGN_API_HOST" ]]; then
  echo "○ --probe skipped (DESIGN_HOST / DESIGN_API_HOST unset)"
  exit 0
fi

API_BASE="https://${DESIGN_API_HOST}"
DESIGN_BASE="https://${DESIGN_HOST}"

echo "Remote probes"
echo "    OD:         $DESIGN_BASE"
echo "    design-api: $API_BASE"
echo

probe() {
  local name="$1"
  local url="$2"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$url" 2>/dev/null || echo "000")"
  if [[ "$code" == "200" ]]; then
    echo "  ✓ $name → $code"
  else
    echo "  ✗ $name → $code"
  fi
}

probe "OD /api/health" "${DESIGN_BASE}/api/health"
probe "design-api /api/healthz" "${API_BASE}/api/healthz"

healthz_json="$(curl -sf --max-time 12 "${API_BASE}/api/healthz" 2>/dev/null || echo "")"
if [[ -n "$healthz_json" ]]; then
  echo "    healthz: $healthz_json"
fi

deps_json="$(curl -sf --max-time 12 "${API_BASE}/api/healthz/deps" 2>/dev/null || echo "")"
if [[ -n "$deps_json" ]]; then
  storage_remote="$(echo "$deps_json" | sed -n 's/.*"project_storage":"\([^"]*\)".*/\1/p' | head -1)"
  if [[ -n "$storage_remote" && -n "${OD_PROJECT_STORAGE:-}" ]]; then
    expected="$(printf '%s' "$OD_PROJECT_STORAGE" | tr '[:upper:]' '[:lower:]')"
    if [[ "$storage_remote" == "$expected" ]]; then
      echo "  ✓ deps config.project_storage=$storage_remote"
    else
      echo "  ✗ deps project_storage=$storage_remote (env expects $expected)"
    fi
  elif [[ -n "$storage_remote" ]]; then
    echo "    deps project_storage=$storage_remote"
  fi
fi
