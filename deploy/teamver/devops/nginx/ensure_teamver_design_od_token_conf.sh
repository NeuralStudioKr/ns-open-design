#!/usr/bin/env bash
# Create /etc/nginx/conf.d/teamver-design-od-token.conf from .env if missing.
#
# Usage (root):
#   sudo bash ensure_teamver_design_od_token_conf.sh /path/to/.env.staging
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_CONF="/etc/nginx/conf.d/teamver-design-od-token.conf"
EXAMPLE="$SCRIPT_DIR/teamver-design-od-token.conf.example"
ENV_FILE="${1:-}"

if [[ $EUID -ne 0 ]]; then
  echo "❌ root(sudo)로 실행하세요." >&2
  exit 1
fi

if [[ -f "$TOKEN_CONF" ]]; then
  echo "✓ $TOKEN_CONF already exists"
  exit 0
fi

if [[ -z "$ENV_FILE" || ! -f "$ENV_FILE" ]]; then
  echo "❌ env file required: sudo bash $0 deploy/teamver/.env.staging" >&2
  exit 1
fi

if [[ ! -f "$EXAMPLE" ]]; then
  echo "❌ missing example: $EXAMPLE" >&2
  exit 1
fi

od_token="$(awk -F= '$1 == "OD_API_TOKEN" {
  v = substr($0, index($0, "=") + 1)
  gsub(/^["'\'' ]+|["'\'' ]+$/, "", v)
  print v
  exit
}' "$ENV_FILE")"

if [[ -z "$od_token" ]]; then
  echo "❌ OD_API_TOKEN empty in $ENV_FILE" >&2
  exit 1
fi

# nginx map value — escape backslash and double-quote
od_token_escaped="${od_token//\\/\\\\}"
od_token_escaped="${od_token_escaped//\"/\\\"}"

mkdir -p /etc/nginx/conf.d
sed "s|PASTE_OD_API_TOKEN_HERE|${od_token_escaped}|" "$EXAMPLE" > "$TOKEN_CONF"
chmod 600 "$TOKEN_CONF"
echo "✓ created $TOKEN_CONF from $(basename "$ENV_FILE") OD_API_TOKEN"
