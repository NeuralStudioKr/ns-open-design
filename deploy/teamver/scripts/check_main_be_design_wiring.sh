#!/usr/bin/env bash
# Cross-repo sanity: Main BE must know design-api base URL for bootstrap + token-usage M2M (A6).
#
# Does NOT mutate env files — read-only grep against Main BE env on disk.
#
# Usage:
#   bash scripts/check_main_be_design_wiring.sh --staging
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

while (( $# )); do
  case "$1" in
    --staging) ENV_MODE=staging ;;
    --production) ENV_MODE=production ;;
    --env-file)
      shift
      if [[ $# -eq 0 ]]; then
        echo "❌ --env-file requires path"
        exit 1
      fi
      MAIN_BE_ENV_FILE="$1"
      ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
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

echo
echo "==> $pass passed, $fail failed, $warn warnings"
if (( fail > 0 )); then
  exit 1
fi
