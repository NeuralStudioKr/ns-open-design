#!/usr/bin/env bash
# Safe disk reclaim for Design EC2 Docker builds (ENOSPC / slow rebuilds).
# Keeps recent BuildKit cache (pnpm/Next mounts) — do NOT use `docker system prune -a`
# before every deploy; that forces multi-minute cold builds.
set -euo pipefail

UNTIL="${1:-168h}"

echo "==> df before"
df -h / | head -2

echo "==> docker builder prune (unused cache older than ${UNTIL})"
docker builder prune -f --filter "until=${UNTIL}"

echo "==> docker image prune (dangling only)"
docker image prune -f

echo "==> df after"
df -h / | head -2
docker builder du 2>/dev/null | tail -8 || true

echo "Done. If still <5G free: stop leftover containers, then"
echo "  docker builder prune -af   # last resort — cold next build"
