#!/usr/bin/env bash
# Track A unit tests — design-api pytest + embed teamver vitest (no browser).
#
# Usage (ns-open-design repo):
#   bash deploy/teamver/scripts/run_track_a_unit_tests.sh
#   PYTEST_BIN=pytest bash deploy/teamver/scripts/run_track_a_unit_tests.sh
#   PYTHON_BIN=python3 bash deploy/teamver/scripts/run_track_a_unit_tests.sh
#   bash deploy/teamver/scripts/run_track_a_unit_tests.sh --skip-web

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OD_ROOT="$(cd "$ROOT/../.." && pwd)"
SKIP_WEB=0
PYTHON_BIN="${PYTHON_BIN:-python3}"
PYTEST_BIN="${PYTEST_BIN:-}"

for arg in "$@"; do
  case "$arg" in
    --skip-web) SKIP_WEB=1 ;;
    -h|--help)
      sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown: $arg"; exit 1 ;;
  esac
done

echo "==> design-api pytest"
(
  cd "$ROOT/be"
  export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-test}"
  export POSTGRES_PASSWD="${POSTGRES_PASSWD:-test}"
  export PYTHONPATH="${PYTHONPATH:-.}"
  if [[ -n "$PYTEST_BIN" ]]; then
    "$PYTEST_BIN" -q
  elif command -v pytest >/dev/null 2>&1; then
    pytest -q
  else
    "$PYTHON_BIN" -m pytest -q
  fi
)

echo "==> validate_deploy_env fixture"
bash "$ROOT/scripts/test_validate_deploy_env.sh"
bash "$ROOT/scripts/test_seed_main_be_design_app.sh"
bash "$ROOT/scripts/test_run_post_deploy_track_a.sh"
bash "$ROOT/scripts/test_print_cloudwatch_alarm_commands.sh"
bash "$ROOT/scripts/test_apply_staging_s3_env.sh"
bash "$ROOT/scripts/test_run_s3_integration_test.sh"
bash "$ROOT/scripts/test_restore_app_sqlite_from_s3.sh"
bash "$ROOT/scripts/test_backup_sqlite_to_s3.sh"
bash "$ROOT/scripts/test_s3_lifecycle_policy.sh"

if [[ "$SKIP_WEB" -eq 0 ]]; then
  echo "==> daemon teamver vitest"
  (
    cd "$OD_ROOT/apps/daemon"
    npm test -- --run \
      tests/teamver-billing-bridge.test.ts \
      tests/teamver-usage-bridge.test.ts \
      tests/teamver-project-access.test.ts \
      tests/teamver-project-storage-meta.test.ts \
      tests/teamver-linked-dirs-gate.test.ts
  )

  echo "==> web teamver vitest"
  (
    cd "$OD_ROOT/apps/web"
    npm test -- tests/teamver-publish-drive.test.ts \
      tests/teamver-list-project-outputs.test.ts \
      tests/teamver-open-drive-publish-menu-item.test.tsx \
      tests/teamver-branding-head.test.tsx \
      tests/teamver-project-registry.test.ts \
      tests/teamver-use-embed.test.tsx \
      tests/teamver-workspace-utils.test.ts \
      tests/teamver-design-access.test.ts \
      tests/teamver-embed-local-ui.test.ts \
      tests/teamver-embed-local-workspace-policy.test.ts \
      tests/teamver-embed-project-sanitize.test.ts \
      tests/teamver-workspace-switcher.test.tsx
  )
fi

echo "✓ Track A unit tests passed"
