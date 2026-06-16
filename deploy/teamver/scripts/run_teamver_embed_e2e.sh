#!/usr/bin/env bash
# Teamver embed Playwright smoke (P-7 external-link gates).
#
# Mode A — harness boots web + daemon (default, may take up to 3 min):
#   bash deploy/teamver/scripts/run_teamver_embed_e2e.sh
#
# Mode B — reuse already-running dev stack (faster local iteration):
#   VITE_TEAMVER_EMBED=1 pnpm --dir . tools-dev run web --web-port 17573 --daemon-port 17456
#   bash deploy/teamver/scripts/run_teamver_embed_e2e.sh --reuse

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
E2E_DIR="$ROOT/e2e"
WEB_PORT="${OD_WEB_PORT:-17573}"
DAEMON_PORT="${OD_PORT:-17456}"
export OD_WEB_PORT="$WEB_PORT"
export OD_PORT="$DAEMON_PORT"
export VITE_TEAMVER_EMBED=1

REUSE=0
for arg in "$@"; do
  case "$arg" in
    --reuse) REUSE=1 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

if [[ "$REUSE" -eq 1 ]]; then
  if ! curl -sf "http://127.0.0.1:${WEB_PORT}/" >/dev/null 2>&1; then
    echo "✗ No web server on http://127.0.0.1:${WEB_PORT}/ — start tools-dev web first." >&2
    exit 1
  fi
  export OD_SKIP_WEBSERVER=1
  echo "→ Reusing web on :${WEB_PORT} (OD_SKIP_WEBSERVER=1)"
else
  export OD_PLAYWRIGHT_WEBSERVER_TIMEOUT="${OD_PLAYWRIGHT_WEBSERVER_TIMEOUT:-180000}"
  echo "→ Playwright will boot web + daemon (timeout ${OD_PLAYWRIGHT_WEBSERVER_TIMEOUT}ms)"
fi

cd "$E2E_DIR"
pnpm exec playwright test -c playwright.config.ts ui/teamver-embed-external-links.test.ts
