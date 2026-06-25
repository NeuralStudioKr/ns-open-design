#!/usr/bin/env bash
# Static checks — plugin preview nginx include (docs-teamver/25).
#
# Usage: bash deploy/teamver/scripts/test_teamver_design_plugin_preview_nginx.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NGINX_DIR="$ROOT/devops/nginx"
INC="$NGINX_DIR/teamver-design-plugin-preview.inc.conf"

if [[ ! -f "$INC" ]]; then
  echo "❌ missing $INC"
  exit 1
fi

for conf in \
  stg-design.teamver.com.https.conf \
  stg-design.teamver.com.http.conf \
  design.teamver.com.https.conf \
  design.teamver.com.http.conf
do
  path="$NGINX_DIR/$conf"
  if [[ ! -f "$path" ]]; then
    echo "❌ missing $path"
    exit 1
  fi
  if ! grep -q 'teamver-design-plugin-preview.inc.conf' "$path"; then
    echo "❌ $conf must include teamver-design-plugin-preview.inc.conf"
    exit 1
  fi
done

needles=(
  'location ~ ^/api/plugins/[^/]+/asset/'
  'location ~ ^/api/plugins/[^/]+/(preview|example/)'
  'location ~ ^/api/skills/[^/]+/assets/'
  'proxy_hide_header Content-Security-Policy'
  'fonts.googleapis.com'
  'limit_except GET HEAD'
)
for needle in "${needles[@]}"; do
  if ! grep -qF "$needle" "$INC"; then
    echo "❌ inc missing pattern: $needle"
    exit 1
  fi
done

# Asset route must not use auth_request (session gate breaks sandbox subresources).
if awk '/^location ~ \^\/api\/plugins/,/^}/' "$INC" | head -20 | grep -q 'auth_request'; then
  echo "❌ plugin asset location must not use auth_request"
  exit 1
fi

# Preview route must keep auth_request.
if ! awk '/preview\|example\//,/^}/' "$INC" | grep -q 'auth_request /_teamver_auth'; then
  echo "❌ plugin preview location must keep auth_request"
  exit 1
fi

echo "✓ teamver-design-plugin-preview nginx static checks"
