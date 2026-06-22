#!/usr/bin/env bash
# Fixture checks for run_post_deploy_track_a.sh argument parsing.
#
# Usage: bash deploy/teamver/scripts/test_run_post_deploy_track_a.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/run_post_deploy_track_a.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "❌ missing $SCRIPT"
  exit 1
fi

help_out="$(bash "$SCRIPT" --help 2>&1)"
for needle in '--rds' '--smoke' '--status-probe' '--seed-verify' '--e2e' '--e2e-strict'; do
  if ! grep -q -- "$needle" <<< "$help_out"; then
    echo "❌ --help missing $needle"
    echo "$help_out"
    exit 1
  fi
done

if ! grep -q 'E2E_ARGS+=(--require-core)' "$SCRIPT"; then
  echo "❌ --e2e-strict must forward --require-core to Track A E2E"
  exit 1
fi

# --seed-verify requires MAIN_BE_DATABASE_URL.
if MAIN_BE_DATABASE_URL='' \
   bash "$SCRIPT" --staging --seed-verify --deps-only >/dev/null 2>&1; then
  echo "❌ --seed-verify must fail without MAIN_BE_DATABASE_URL"
  exit 1
fi

# Unknown args must fail.
if bash "$SCRIPT" --not-a-flag >/dev/null 2>&1; then
  echo "❌ expected failure for unknown flag"
  exit 1
fi

echo "✓ run_post_deploy_track_a fixture ok"
