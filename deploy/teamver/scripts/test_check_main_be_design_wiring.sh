#!/usr/bin/env bash
# Fixture checks for check_main_be_design_wiring.sh.
#
# Usage: bash deploy/teamver/scripts/test_check_main_be_design_wiring.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/check_main_be_design_wiring.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "❌ missing $SCRIPT"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

MAIN_ENV="$WORK/main.env.staging"
SIDE_ENV="$WORK/sidecar.env.staging"
cat > "$MAIN_ENV" <<'EOF'
TEAMVER_DESIGN_API_BASE_URL=https://stg-design-api.teamver.com
TEAMVER_INTERNAL_API_KEY=shared-m2m-key
EOF
cat > "$SIDE_ENV" <<'EOF'
TEAMVER_INTERNAL_API_KEY=shared-m2m-key
EOF

ok_out="$(SIDEcar_ENV_FILE="$SIDE_ENV" bash "$SCRIPT" --staging --env-file "$MAIN_ENV" 2>&1)"
if ! grep -q '✓ Main BE TEAMVER_DESIGN_API_BASE_URL=' <<< "$ok_out"; then
  echo "❌ expected URL match in output"
  echo "$ok_out"
  exit 1
fi

bad_env="$WORK/bad.env.staging"
echo 'TEAMVER_DESIGN_API_BASE_URL=https://wrong.example.com' > "$bad_env"
if bash "$SCRIPT" --staging --env-file "$bad_env" >/dev/null 2>&1; then
  echo "❌ expected failure for wrong design-api URL"
  exit 1
fi

missing_out="$(bash "$SCRIPT" --staging --env-file "$WORK/missing.env" 2>&1 || true)"
if ! grep -q 'env file not found' <<< "$missing_out"; then
  echo "❌ expected graceful skip when Main BE env missing"
  echo "$missing_out"
  exit 1
fi

if bash "$SCRIPT" --not-a-flag >/dev/null 2>&1; then
  echo "❌ expected failure for unknown flag"
  exit 1
fi

echo "✓ check_main_be_design_wiring fixture ok"
