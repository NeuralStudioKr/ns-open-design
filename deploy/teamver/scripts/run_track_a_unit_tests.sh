#!/usr/bin/env bash
# Track A unit tests — design-api pytest + embed teamver vitest (no browser).
#
# Usage (ns-open-design repo):
#   bash deploy/teamver/scripts/run_track_a_unit_tests.sh
#   bash deploy/teamver/scripts/run_track_a_unit_tests.sh --skip-web

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OD_ROOT="$(cd "$ROOT/../.." && pwd)"
SKIP_WEB=0

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
  python -m pytest -q
)

if [[ "$SKIP_WEB" -eq 0 ]]; then
  echo "==> web teamver vitest"
  (
    cd "$OD_ROOT/apps/web"
    npm test -- tests/teamver-publish-drive.test.ts \
      tests/teamver-list-project-outputs.test.ts \
      tests/teamver-open-drive-publish-menu-item.test.tsx \
      tests/teamver-project-registry.test.ts
  )
fi

echo "✓ Track A unit tests passed"
