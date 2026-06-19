#!/usr/bin/env bash
# Static checks for verify_od_core / run_od_core_verify scripts (no live docker).
#
# Usage: bash deploy/teamver/scripts/test_verify_od_core.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS=(
  "$ROOT/scripts/verify_od_core.sh"
  "$ROOT/scripts/run_od_core_verify.sh"
  "$ROOT/scripts/seed_od_byok_app_config.sh"
  "$ROOT/scripts/seed_od_runtime_config.sh"
)

for script in "${SCRIPTS[@]}"; do
  bash -n "$script"
  echo "✓ bash -n $(basename "$script")"
done

for script in "${SCRIPTS[@]}"; do
  out="$(bash "$script" --help 2>&1 || true)"
  if ! grep -qiE 'usage|verify_od_core|run_od_core_verify|seed_od_byok|seed_od_runtime' <<< "$out"; then
    echo "❌ missing Usage in $(basename "$script")"
    exit 1
  fi
  echo "✓ --help $(basename "$script")"
done

if [[ ! -f "$ROOT/docker-compose.od-core-verify.yml" ]]; then
  echo "❌ docker-compose.od-core-verify.yml missing"
  exit 1
fi
grep -q 'TEAMVER_DESIGN_API_URL: ""' "$ROOT/docker-compose.od-core-verify.yml"
grep -q '7457' "$ROOT/docker-compose.od-core-verify.yml"
echo "✓ docker-compose.od-core-verify.yml"

grep -q -- '--compose-file "$COMPOSE_FILE"' "$ROOT/scripts/run_od_core_verify.sh"
grep -q -- '--compose-file FILE' "$ROOT/scripts/seed_od_runtime_config.sh"
grep -q -- '--compose-file docker-compose.od-core-verify.yml' "$ROOT/scripts/seed_od_byok_app_config.sh"
echo "✓ seed scripts support od-core compose file"

doc="$ROOT/../../docs-teamver/13_OD_단독_검증_서버_가이드.md"
if [[ ! -f "$doc" ]]; then
  echo "❌ docs-teamver/13_OD_단독_검증_서버_가이드.md missing"
  exit 1
fi
grep -q 'run_od_core_verify.sh' "$doc"
echo "✓ runbook doc present"

echo "✓ test_verify_od_core.sh OK"
