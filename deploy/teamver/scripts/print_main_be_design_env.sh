#!/usr/bin/env bash
# Print Main BE env lines for design-api M2M wiring (A6).
#
# Usage:
#   bash scripts/print_main_be_design_env.sh --staging
#   bash scripts/print_main_be_design_env.sh --production
#
# Merge into ns-teamver-be/.env.staging (or production) on the Main BE host.
# TEAMVER_INTERNAL_API_KEY must match deploy/teamver sidecar .env.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_MODE=""

while (( $# )); do
  case "$1" in
    --staging) ENV_MODE=staging ;;
    --production) ENV_MODE=production ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
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
    DESIGN_API_URL="https://stg-design-api.teamver.com"
    SIDEcar_ENV="$ROOT/.env.staging"
    ;;
  production)
    DESIGN_API_URL="https://design-api.teamver.com"
    SIDEcar_ENV="$ROOT/.env.production"
    ;;
esac

internal_key=""
if [[ -f "$SIDEcar_ENV" ]]; then
  internal_key="$(grep -E '^TEAMVER_INTERNAL_API_KEY=' "$SIDEcar_ENV" 2>/dev/null | tail -1 | cut -d= -f2- | sed 's/^["'\'' ]//;s/["'\'' ]$//' || true)"
fi

cat <<EOF
# --- Main BE ↔ design-api (A6 — append to ns-teamver-be/.env.${ENV_MODE}) ---
# Verify: bash deploy/teamver/scripts/check_main_be_design_wiring.sh --${ENV_MODE}
TEAMVER_DESIGN_API_BASE_URL=${DESIGN_API_URL}
EOF

if [[ -n "$internal_key" ]]; then
  echo "# (TEAMVER_INTERNAL_API_KEY already set on sidecar — ensure Main BE matches)"
  echo "# TEAMVER_INTERNAL_API_KEY=${internal_key}"
else
  echo "# TEAMVER_INTERNAL_API_KEY=<same as design sidecar TEAMVER_INTERNAL_API_KEY>"
fi

echo "# AI_APPS_HTTP_TIMEOUT_SEC=15"
