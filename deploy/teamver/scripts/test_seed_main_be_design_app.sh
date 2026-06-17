#!/usr/bin/env bash
# Fixture checks for seed_main_be_design_app.sh (--help, arg validation).
#
# Usage: bash deploy/teamver/scripts/test_seed_main_be_design_app.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/seed_main_be_design_app.sh"
SQL="$ROOT/scripts/seed_main_be_design_app.sql"

if [[ ! -f "$SCRIPT" ]]; then
  echo "❌ missing $SCRIPT"
  exit 1
fi
if [[ ! -f "$SQL" ]]; then
  echo "❌ missing $SQL"
  exit 1
fi

help_out="$(bash "$SCRIPT" --help 2>&1)"
echo "$help_out" | grep -q -- '--verify-only' || {
  echo "❌ --help missing --verify-only"
  exit 1
}

if MAIN_BE_DATABASE_URL='' bash "$SCRIPT" --verify-only >/dev/null 2>&1; then
  echo "❌ expected failure without MAIN_BE_DATABASE_URL"
  exit 1
fi

if ! grep -q "ai-design" "$SQL"; then
  echo "❌ seed SQL missing ai-design id"
  exit 1
fi

echo "✓ seed_main_be_design_app fixture ok"
