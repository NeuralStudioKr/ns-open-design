#!/usr/bin/env bash
# Cross-repo sanity: Main BE must know design-api base URL for bootstrap + token-usage M2M (A6).
#
# Two modes:
#   default (env grep only) — read-only check of file values, no network.
#   --live                  — additionally probe design-api /api/healthz and
#                             /api/internal/usage/events reachability with the
#                             Main BE internal key (M2M wire-test, loop 142).
#
# Usage:
#   bash scripts/check_main_be_design_wiring.sh --staging
#   bash scripts/check_main_be_design_wiring.sh --staging --live
#   MAIN_BE_ENV_FILE=/path/to/ns-teamver-be/.env.staging \
#     bash scripts/check_main_be_design_wiring.sh --staging
#
# Expected Main BE keys (ns-teamver-be):
#   TEAMVER_DESIGN_API_BASE_URL=https://stg-design-api.teamver.com
#   TEAMVER_INTERNAL_API_KEY=<same as design sidecar TEAMVER_INTERNAL_API_KEY>

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_MODE=""
MAIN_BE_ENV_FILE="${MAIN_BE_ENV_FILE:-}"
SIDEcar_ENV_FILE="${SIDEcar_ENV_FILE:-}"
LIVE=0
CURL_BIN="${CURL_BIN:-curl}"

while (( $# )); do
  case "$1" in
    --staging) ENV_MODE=staging ;;
    --production) ENV_MODE=production ;;
    --live) LIVE=1 ;;
    --env-file)
      shift
      if [[ $# -eq 0 ]]; then
        echo "❌ --env-file requires path"
        exit 1
      fi
      MAIN_BE_ENV_FILE="$1"
      ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
  shift
done

if [[ -z "$ENV_MODE" ]]; then
  echo "❌ --staging 또는 --production 필요"
  exit 1
fi

case "$ENV_MODE" in
  staging)
    EXPECTED_DESIGN_API_URL="${EXPECTED_DESIGN_API_URL:-https://stg-design-api.teamver.com}"
    DEFAULT_MAIN_BE_ENV="$ROOT/../../../ns-teamver-be/.env.staging"
    SIDEcar_ENV="$ROOT/.env.staging"
    ;;
  production)
    EXPECTED_DESIGN_API_URL="${EXPECTED_DESIGN_API_URL:-https://design-api.teamver.com}"
    DEFAULT_MAIN_BE_ENV="$ROOT/../../../ns-teamver-be/.env.production"
    SIDEcar_ENV="$ROOT/.env.production"
    ;;
esac

if [[ -n "$SIDEcar_ENV_FILE" ]]; then
  SIDEcar_ENV="$SIDEcar_ENV_FILE"
fi

if [[ -z "$MAIN_BE_ENV_FILE" ]]; then
  MAIN_BE_ENV_FILE="$DEFAULT_MAIN_BE_ENV"
fi

pass=0
fail=0
warn=0

echo "==> Main BE ↔ design-api wiring check (--$ENV_MODE)"
echo "    expected design-api URL: $EXPECTED_DESIGN_API_URL"
echo "    Main BE env file:        $MAIN_BE_ENV_FILE"
echo

pluck_env() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  grep -E "^${key}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- | sed 's/^["'\'' ]//;s/["'\'' ]$//' || true
}

if [[ ! -f "$MAIN_BE_ENV_FILE" ]]; then
  echo "○ Main BE env file not found — set MAIN_BE_ENV_FILE or create $MAIN_BE_ENV_FILE"
  echo "  required: TEAMVER_DESIGN_API_BASE_URL=$EXPECTED_DESIGN_API_URL"
  exit 0
fi

main_design_url="$(pluck_env "$MAIN_BE_ENV_FILE" TEAMVER_DESIGN_API_BASE_URL)"
main_internal_key="$(pluck_env "$MAIN_BE_ENV_FILE" TEAMVER_INTERNAL_API_KEY)"

if [[ -z "$main_design_url" ]]; then
  echo "✗ TEAMVER_DESIGN_API_BASE_URL unset in $MAIN_BE_ENV_FILE"
  echo "  → Main BE cannot relay bootstrap or token-usage M2M to design-api (A6 blocker)"
  fail=$((fail + 1))
else
  normalized="${main_design_url%/}"
  normalized="${normalized%/api}"
  expected="${EXPECTED_DESIGN_API_URL%/}"
  expected="${expected%/api}"
  if [[ "$normalized" == "$expected" ]]; then
    echo "✓ Main BE TEAMVER_DESIGN_API_BASE_URL=$main_design_url"
    pass=$((pass + 1))
  else
    echo "✗ Main BE TEAMVER_DESIGN_API_BASE_URL=$main_design_url (expected $EXPECTED_DESIGN_API_URL)"
    fail=$((fail + 1))
  fi
fi

if [[ -f "$SIDEcar_ENV" ]]; then
  sidecar_key="$(pluck_env "$SIDEcar_ENV" TEAMVER_INTERNAL_API_KEY)"
  if [[ -z "$sidecar_key" ]]; then
    echo "○ design sidecar TEAMVER_INTERNAL_API_KEY unset in $SIDEcar_ENV"
    warn=$((warn + 1))
  elif [[ -z "$main_internal_key" ]]; then
    echo "✗ Main BE TEAMVER_INTERNAL_API_KEY unset (design sidecar has key)"
    fail=$((fail + 1))
  elif [[ "$main_internal_key" == "$sidecar_key" ]]; then
    echo "✓ Main BE TEAMVER_INTERNAL_API_KEY matches design sidecar"
    pass=$((pass + 1))
  else
    echo "✗ Main BE TEAMVER_INTERNAL_API_KEY ≠ design sidecar (M2M mismatch)"
    fail=$((fail + 1))
  fi
else
  echo "○ skip internal key cross-check (no $SIDEcar_ENV on host)"
fi

if [[ "$LIVE" -eq 1 ]]; then
  echo
  echo "==> live probe (M2M reachability)"
  if [[ -z "$main_design_url" ]]; then
    echo "○ live skipped — TEAMVER_DESIGN_API_BASE_URL unset in Main BE env"
  else
    if ! command -v "$CURL_BIN" >/dev/null 2>&1; then
      echo "○ live skipped — curl not available ($CURL_BIN)"
    else
      probe_base="${main_design_url%/}"
      # Strip trailing /api so we hit /api/healthz once, not /api/api/healthz.
      probe_base="${probe_base%/api}"

      healthz_code="$($CURL_BIN -s -o /dev/null -w '%{http_code}' --max-time 12 \
        "${probe_base}/api/healthz" 2>/dev/null || echo 000)"
      if [[ "$healthz_code" == "200" ]]; then
        echo "✓ design-api ${probe_base}/api/healthz → 200"
        pass=$((pass + 1))
      else
        echo "✗ design-api ${probe_base}/api/healthz → ${healthz_code} (network/nginx/auth gate or design-api down)"
        fail=$((fail + 1))
      fi

      deps_json="$($CURL_BIN -s --max-time 12 "${probe_base}/api/healthz/deps" 2>/dev/null || true)"
      if [[ -n "$deps_json" ]]; then
        deps_storage="$(echo "$deps_json" | sed -n 's/.*"project_storage":"\([^"]*\)".*/\1/p' | head -1)"
        if [[ "$deps_storage" == "s3" ]]; then
          echo "✓ design-api deps config.project_storage=s3"
          pass=$((pass + 1))
        elif [[ -n "$deps_storage" ]]; then
          echo "✗ design-api deps config.project_storage=${deps_storage} (Track A requires s3)"
          fail=$((fail + 1))
        else
          echo "○ design-api deps JSON missing project_storage (older build?)"
          warn=$((warn + 1))
        fi
        deps_db="$(echo "$deps_json" | sed -n 's/.*"db":"\([^"]*\)".*/\1/p' | head -1)"
        if [[ "$deps_db" == "ok" ]]; then
          echo "✓ design-api deps checks.db=ok"
          pass=$((pass + 1))
        elif [[ -n "$deps_db" ]]; then
          echo "✗ design-api deps checks.db=${deps_db} (RDS connectivity)"
          fail=$((fail + 1))
        fi
      else
        echo "○ design-api /api/healthz/deps no body — public endpoint may be behind nginx auth gate (run from EC2 loopback or use --env-file)"
        warn=$((warn + 1))
      fi

      # M2M internal endpoint reachability — POST without body returns 4xx
      # (validation_error / unauthorized). We only care that we reached
      # design-api with the key, not the response shape.
      if [[ -n "$main_internal_key" ]]; then
        m2m_code="$($CURL_BIN -s -o /dev/null -w '%{http_code}' --max-time 12 \
          -X POST -H "Content-Type: application/json" \
          -H "X-Teamver-Internal-Api-Key: ${main_internal_key}" \
          --data '{}' \
          "${probe_base}/api/internal/usage/events" 2>/dev/null || echo 000)"
        case "$m2m_code" in
          200|202|204|400|401|403|404|409|422)
            echo "✓ design-api /api/internal/usage/events M2M reachable (code=${m2m_code})"
            pass=$((pass + 1))
            ;;
          000)
            echo "✗ design-api /api/internal/usage/events unreachable (network/DNS)"
            fail=$((fail + 1))
            ;;
          *)
            echo "✗ design-api /api/internal/usage/events code=${m2m_code} (expected 2xx/4xx for M2M reachability)"
            fail=$((fail + 1))
            ;;
        esac
      else
        echo "○ live M2M skipped — Main BE TEAMVER_INTERNAL_API_KEY empty"
        warn=$((warn + 1))
      fi
    fi
  fi
fi

echo
echo "==> $pass passed, $fail failed, $warn warnings"
if (( fail > 0 )); then
  exit 1
fi
