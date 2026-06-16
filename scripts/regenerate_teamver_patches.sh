#!/usr/bin/env bash
# Regenerate patches/teamver/*.patch from upstream/main (web touchpoints only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PATCH_DIR="$ROOT/patches/teamver"

cd "$ROOT"
git fetch upstream

write_patch() {
  local out="$1"
  shift
  git format-patch upstream/main --stdout -- "$@" > "$PATCH_DIR/$out"
}

write_patch 0001-entry-shell-teamver-hooks.patch apps/web/src/components/EntryShell.tsx
write_patch 0002-web-package-teamver-sdk.patch apps/web/package.json
write_patch 0003-web-index-css-teamver-embed.patch apps/web/src/index.css
write_patch 0004-app-teamver-embed-integration.patch apps/web/src/App.tsx

echo "Wrote patches under $PATCH_DIR"
wc -l "$PATCH_DIR"/*.patch
