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
if [[ -n "${TEAMVER_DESIGN_API_URL:-}" ]]; then
  flag "embed local-folder gates" "enabled (daemon rejects linkedDirs/import)"
else
  flag "embed local-folder gates" "(standalone — TEAMVER_DESIGN_API_URL unset)"
fi
registry_set_count=0
[[ -n "${TEAMVER_REGISTRY_APP_ID:-}" ]] && registry_set_count=$((registry_set_count + 1))
[[ -n "${TEAMVER_REGISTRY_KEY_ID:-}" ]] && registry_set_count=$((registry_set_count + 1))
[[ -n "${TEAMVER_REGISTRY_ACCESS_KEY:-}" ]] && registry_set_count=$((registry_set_count + 1))
case "$registry_set_count" in
  0) flag "registry billing" "(disabled — TEAMVER_REGISTRY_* unset, run_lifecycle skips)" ;;
  3) flag "registry billing" "enabled (reserve/commit/refund active)" ;;
  *) flag "registry billing" "PARTIAL — fix or clear all three TEAMVER_REGISTRY_*" ;;
esac
if [[ -n "${TEAMVER_DRIVE_PUBLISH_FOLDER_ID:-}" ]]; then
  flag "drive publish folder" "set (export → Teamver Drive folder ${TEAMVER_DRIVE_PUBLISH_FOLDER_ID:0:8}…)"
else
  flag "drive publish folder" "(unset — publish lands at Drive root; G7 isolation 권장)"
fi
if [[ "${TEAMVER_BILLING_DISABLED:-}" == "1" ]]; then
  flag "daemon billing bridge" "DISABLED (TEAMVER_BILLING_DISABLED=1; run lifecycle skip)"
elif [[ -n "${TEAMVER_DESIGN_API_URL:-}" && -n "${TEAMVER_INTERNAL_API_KEY:-}" ]]; then
  flag "daemon billing bridge" "enabled (reserve→commit/refund on terminal run)"
else
  flag "daemon billing bridge" "(off — TEAMVER_DESIGN_API_URL·TEAMVER_INTERNAL_API_KEY 미설정)"
fi
echo

echo "Scratch & sync-up (storage hardening)"
if [[ "$storage" == "s3" ]]; then
  flag "OD_SCRATCH_DIR" "${OD_SCRATCH_DIR:-/app/.od/scratch (default)}"
  if [[ "${OD_SCRATCH_EVICT_AFTER_RUN:-}" == "1" ]]; then
    flag "scratch eviction" "post-run evict (OD_SCRATCH_EVICT_AFTER_RUN=1)"
  else
    flag "scratch eviction" "(lazy TTL only — set OD_SCRATCH_EVICT_AFTER_RUN=1 for tight disk)"
  fi
  if [[ "${OD_S3_SYNC_UP_METRICS:-}" == "1" ]]; then
    flag "od_s3_sync_up_failed JSON" "lazy + run-end emit (CW metric filter ready)"
  else
    flag "od_s3_sync_up_failed JSON" "run-end only (set OD_S3_SYNC_UP_METRICS=1 to also emit on lazy)"
  fi
  if [[ "${OD_SCRATCH_DISK_METRICS:-}" == "1" ]]; then
    flag "od_scratch_disk_usage JSON" "run-end + periodic (interval ms=${OD_SCRATCH_DISK_METRIC_INTERVAL_MS:-300000}, threshold MB=${OD_SCRATCH_DISK_THRESHOLD_MB:-2048})"
  else
    flag "od_scratch_disk_usage JSON" "(disabled — set OD_SCRATCH_DISK_METRICS=1 for CW disk alarm)"
  fi
else
  flag "scratch / sync-up" "(disabled — OD_PROJECT_STORAGE!=s3)"
fi
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
probe "OD /api/health/storage" "${DESIGN_BASE}/api/health/storage"
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
  od_storage_remote="$(echo "$deps_json" | sed -n 's/.*"od_storage":"\([^"]*\)".*/\1/p' | head -1)"
  if [[ -n "$od_storage_remote" ]]; then
    if [[ "$od_storage_remote" == "ok" ]]; then
      echo "  ✓ deps checks.od_storage=ok"
    else
      echo "  ✗ deps checks.od_storage=$od_storage_remote"
    fi
  fi
fi
