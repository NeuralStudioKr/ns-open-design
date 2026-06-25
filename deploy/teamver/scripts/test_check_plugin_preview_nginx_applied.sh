#!/usr/bin/env bash
# Fixture — check_plugin_preview_nginx_applied.sh (--repo mode).
#
# Usage: bash deploy/teamver/scripts/test_check_plugin_preview_nginx_applied.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="$ROOT/scripts/check_plugin_preview_nginx_applied.sh"
NGINX_DIR="$ROOT/devops/nginx"

if [[ ! -x "$CHECK" ]]; then
  chmod +x "$CHECK"
fi

export TEAMVER_PLUGIN_PREVIEW_REPO_MAIN="$NGINX_DIR/stg-design.teamver.com.https.conf"
export TEAMVER_PLUGIN_PREVIEW_REPO_INC="$NGINX_DIR/teamver-design-plugin-preview.inc.conf"

out="$(bash "$CHECK" --repo 2>&1)"
if ! grep -q 'plugin preview nginx checks ok' <<< "$out"; then
  echo "❌ --repo check failed:"
  echo "$out"
  exit 1
fi
echo "✓ check_plugin_preview_nginx_applied --repo"
