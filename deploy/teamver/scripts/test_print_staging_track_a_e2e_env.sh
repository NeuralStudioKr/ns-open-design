#!/usr/bin/env bash
# Fixture checks for print_staging_track_a_e2e_env.sh.
#
# Usage: bash deploy/teamver/scripts/test_print_staging_track_a_e2e_env.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/print_staging_track_a_e2e_env.sh"

if [[ ! -x "$SCRIPT" ]]; then
  echo "❌ missing or not executable: $SCRIPT"
  exit 1
fi

out="$(bash "$SCRIPT")"
for needle in \
  'TEAMVER_COOKIE=' \
  'TEAMVER_INTERNAL_API_KEY=' \
  'MAIN_BE_DATABASE_URL=' \
  'TEAMVER_OD_PROJECT_ID=' \
  'TEAMVER_PUBLISH_ARTIFACT_FILE=' \
  'TEAMVER_DRIVE_IMPORT_ASSET_ID=' \
  'TEAMVER_DRIVE_IMPORT_FILENAME=' \
  'D-B1/D-B2' \
  'D-B3' \
  'D-6b policy probe' \
  'D-7 — publish 201' \
  'D-8 — publish 207' \
  'run_staging_track_a_e2e.sh'
do
  if ! grep -q -- "$needle" <<< "$out"; then
    echo "❌ print_staging_track_a_e2e_env missing: $needle"
    echo "$out"
    exit 1
  fi
done

example="$ROOT/.env.staging.example"
if [[ -f "$example" ]]; then
  from_env="$(bash "$SCRIPT" --from-env "$example")"
  if ! grep -q 'teamver_design_staging' <<< "$from_env"; then
    echo "❌ --from-env should include POSTGRES_DB from example"
    exit 1
  fi
fi

echo "✓ print_staging_track_a_e2e_env fixture ok"
