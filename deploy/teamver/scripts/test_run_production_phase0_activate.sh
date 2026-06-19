#!/usr/bin/env bash
# Fixture checks for run_production_phase0_activate.sh.
#
# Usage: bash deploy/teamver/scripts/test_run_production_phase0_activate.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/run_production_phase0_activate.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "❌ missing $SCRIPT"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ENV_FILE="$WORK/.env.production"
cat > "$ENV_FILE" <<'EOF'
ENV=production
OD_API_TOKEN=fixture-prod-token-min-32-chars-long-enough
TEAMVER_JWT_SECRET=fixture-jwt
POSTGRES_HOST=teamver-design-prod.x.rds.amazonaws.com
POSTGRES_PASSWD=secret
POSTGRES_DB=teamver_design_production
POSTGRES_USER=teamver_design_admin
TEAMVER_API_BASE_URL=https://api.teamver.com
TEAMVER_INTERNAL_API_KEY=shared-key
TEAMVER_OD_API_KEY=managed-key
EOF

before_hash="$(cksum "$ENV_FILE" | awk '{print $1 ":" $2}')"
dry_out="$(ENV_FILE="$ENV_FILE" bash "$SCRIPT" --dry-run 2>&1)"
after_hash="$(cksum "$ENV_FILE" | awk '{print $1 ":" $2}')"
if [[ "$before_hash" != "$after_hash" ]]; then
  echo "❌ dry-run mutated env file"
  exit 1
fi
for needle in \
  'Phase 0 production activation' \
  'Production uses dedicated RDS' \
  'dry-run — skipped'
do
  if ! grep -q -- "$needle" <<< "$dry_out"; then
    echo "❌ dry-run output missing: $needle"
    echo "$dry_out"
    exit 1
  fi
done

if bash "$SCRIPT" --not-a-flag >/dev/null 2>&1; then
  echo "❌ expected failure for unknown flag"
  exit 1
fi

if ENV_FILE="$WORK/missing.env.production" bash "$SCRIPT" >/dev/null 2>&1; then
  echo "❌ expected failure with missing ENV_FILE"
  exit 1
fi

echo "✓ run_production_phase0_activate fixture ok"

