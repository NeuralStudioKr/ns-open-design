#!/usr/bin/env bash
# EC2 — plugin preview nginx include 적용 여부 (docs-teamver/25 §6.4).
#
# Usage (deploy/teamver on Design VM):
#   bash scripts/check_plugin_preview_nginx_applied.sh
#   bash scripts/check_plugin_preview_nginx_applied.sh --staging --curl
#   bash scripts/check_plugin_preview_nginx_applied.sh --repo   # CI: repo conf only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_MODE="${ENV_MODE:-staging}"
DO_CURL=0
REPO_MODE=0
DESIGN_HOST="${DESIGN_HOST:-}"

for arg in "$@"; do
  case "$arg" in
    --staging) ENV_MODE=staging; DESIGN_HOST="${DESIGN_HOST:-stg-design.teamver.com}" ;;
    --production) ENV_MODE=production; DESIGN_HOST="${DESIGN_HOST:-design.teamver.com}" ;;
    --curl) DO_CURL=1 ;;
    --repo) REPO_MODE=1 ;;
    -h|--help)
      sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown: $arg"; exit 1 ;;
  esac
done

if [[ -z "$DESIGN_HOST" ]]; then
  DESIGN_HOST="stg-design.teamver.com"
fi

CONF_NAME="stg-design.teamver.com.https.conf"
if [[ "$ENV_MODE" == "production" ]]; then
  CONF_NAME="design.teamver.com.http.conf"
fi

if [[ "$REPO_MODE" -eq 1 ]]; then
  ENABLED="${TEAMVER_PLUGIN_PREVIEW_REPO_MAIN:-$ROOT/devops/nginx/$CONF_NAME}"
  INC="${TEAMVER_PLUGIN_PREVIEW_REPO_INC:-$ROOT/devops/nginx/teamver-design-plugin-preview.inc.conf}"
else
  ENABLED="/etc/nginx/sites-enabled/$CONF_NAME"
  INC="/etc/nginx/sites-available/teamver-design-plugin-preview.inc.conf"
fi

fail=0

check() {
  if ! eval "$1"; then
    echo "✗ $2"
    fail=1
  else
    echo "✓ $2"
  fi
}

check "[[ -f '$ENABLED' ]]" "main conf present: $ENABLED"
check "grep -q 'teamver-design-plugin-preview.inc.conf' '$ENABLED' 2>/dev/null" "main conf includes teamver-design-plugin-preview.inc.conf"
check "[[ -f '$INC' ]]" "plugin-preview inc present: $INC"
check "grep -q 'location /api/plugins/' '$INC' 2>/dev/null" "inc uses prefix location /api/plugins/"
check "! awk '/^location \\/api\\/plugins\\/ \\{/,/^}/' '$INC' | grep -q '^    auth_request'" \
  "parent /api/plugins/ has no auth_request (nested catch-all only)"

if [[ "$REPO_MODE" -eq 0 ]] && command -v nginx >/dev/null 2>&1 && [[ -r "$ENABLED" ]]; then
  if sudo nginx -t >/dev/null 2>&1; then
    if sudo nginx -T 2>/dev/null | grep -q 'location /api/plugins/'; then
      echo "✓ nginx -T contains location /api/plugins/"
    else
      echo "✗ nginx -T missing location /api/plugins/ — reload after apply"
      fail=1
    fi
  else
    echo "○ skip nginx -T — nginx -t failed (run with sudo on VM)"
  fi
elif [[ "$REPO_MODE" -eq 1 ]]; then
  echo "○ skip nginx -T — --repo mode"
else
  echo "○ skip nginx -T — not on VM or nginx missing"
fi

ASSET_URL="https://${DESIGN_HOST}/api/plugins/example-html-ppt-zhangzara-creative-mode/asset/assets/deck-stage.js"
if [[ "$DO_CURL" -eq 1 && "$REPO_MODE" -eq 0 ]]; then
  headers="$(mktemp)"
  code="$(curl -s -o /dev/null -D "$headers" -w '%{http_code}' --max-time 20 "$ASSET_URL" 2>/dev/null || echo 000)"
  location="$(awk 'BEGIN{IGNORECASE=1} /^Location:/ {sub(/\r$/,""); print substr($0, index($0,":")+1)}' "$headers" | xargs | head -1)"
  rm -f "$headers"
  case "$code" in
    200|404)
      if grep -qi 'auth/signin' <<< "${location:-}"; then
        echo "✗ curl asset ${code} but Location signin — nested location not active"
        fail=1
      else
        echo "✓ curl asset → ${code} (no signin redirect)"
      fi
      ;;
    302|301)
      echo "✗ curl asset → ${code} redirect ${location:-?} (plugin-preview inc not applied?)"
      fail=1
      ;;
    000)
      echo "○ curl asset unreachable (offline?)"
      ;;
    *)
      echo "✗ curl asset → ${code}"
      fail=1
      ;;
  esac
fi

if [[ "$fail" -ne 0 ]]; then
  echo
  echo "Fix (from deploy/teamver on this VM, after git pull):"
  echo "  cd devops/nginx"
  echo "  sudo bash ./apply_teamver_design_staging_nginx_conf.sh ./stg-design.teamver.com.https.conf \\"
  echo "    --disable stg-design.teamver.com.http.conf"
  echo "  bash scripts/check_plugin_preview_nginx_applied.sh --staging --curl"
  exit 1
fi

echo "✓ plugin preview nginx checks ok"
