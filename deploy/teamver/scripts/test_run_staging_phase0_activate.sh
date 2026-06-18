#!/usr/bin/env bash
# Fixture checks for run_staging_phase0_activate.sh.
#
# Usage: bash deploy/teamver/scripts/test_run_staging_phase0_activate.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/run_staging_phase0_activate.sh"
PRINT="$ROOT/scripts/print_main_be_design_env.sh"

for f in "$SCRIPT" "$PRINT"; do
  if [[ ! -f "$f" ]]; then
    echo "❌ missing $f"
    exit 1
  fi
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ENV_FILE="$WORK/.env.staging"
cat > "$ENV_FILE" <<'EOF'
ENV=staging
OD_API_TOKEN=fixture-token-min-32-chars-long-enough
TEAMVER_JWT_SECRET=fixture-jwt
POSTGRES_HOST=teamver-design-staging.x.rds.amazonaws.com
POSTGRES_PASSWD=secret
POSTGRES_DB=teamver_design_staging
POSTGRES_USER=teamver_design_admin
TEAMVER_API_BASE_URL=https://stg-api.teamver.com
TEAMVER_INTERNAL_API_KEY=shared-key
EOF

before_hash="$(shasum -a 256 "$ENV_FILE" | awk '{print $1}')"
dry_out="$(ENV_FILE="$ENV_FILE" bash "$SCRIPT" --dry-run 2>&1)"
after_hash="$(shasum -a 256 "$ENV_FILE" | awk '{print $1}')"
if [[ "$before_hash" != "$after_hash" ]]; then
  echo "❌ dry-run mutated env file"
  exit 1
fi
if ! grep -q 'dry-run complete' <<< "$dry_out"; then
  echo "❌ dry-run path failed"
  echo "$dry_out"
  exit 1
fi

staging_print="$(bash "$PRINT" --staging 2>&1)"
if ! grep -q 'TEAMVER_DESIGN_API_BASE_URL=https://stg-design-api.teamver.com' <<< "$staging_print"; then
  echo "❌ print_main_be_design_env staging URL missing"
  echo "$staging_print"
  exit 1
fi

if bash "$SCRIPT" --not-a-flag >/dev/null 2>&1; then
  echo "❌ expected failure for unknown flag"
  exit 1
fi

if bash "$SCRIPT" 2>/dev/null; then
  echo "❌ expected failure without .env.staging in deploy root"
  exit 1
fi

echo "✓ run_staging_phase0_activate fixture ok"
