#!/usr/bin/env bash
set -euo pipefail

# Teamver Design Staging — Let's Encrypt HTTP-01 (webroot)
# SAN: stg-design.teamver.com, stg-design-api.teamver.com
#
# 선행:
#   sudo bash devops/nginx/apply_teamver_design_staging_nginx_conf.sh \
#     ./stg-design.teamver.com.http.conf
#   sudo systemctl reload nginx

WEBROOT="/var/www/certbot"
EMAIL="${CERTBOT_EMAIL:-dev@neuralstudio.kr}"

if [[ -n "${CERTBOT_DESIGN_STG_DOMAINS:-}" ]]; then
  IFS=' ' read -r -a DOMAINS <<< "${CERTBOT_DESIGN_STG_DOMAINS}"
else
  DOMAINS=(
    "stg-design.teamver.com"
    "stg-design-api.teamver.com"
  )
fi

CERT_NAME="${DOMAINS[0]}"
NGINX_BIN="${NGINX_BIN:-nginx}"

echo "==> nginx -t"
sudo "$NGINX_BIN" -t

echo "==> certbot"
if ! command -v certbot >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y certbot
fi

sudo mkdir -p "$WEBROOT"
DOMAIN_ARGS=()
for d in "${DOMAINS[@]}"; do
  DOMAIN_ARGS+=(-d "$d")
done

sudo certbot certonly --webroot -w "$WEBROOT" \
  "${DOMAIN_ARGS[@]}" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --cert-name "$CERT_NAME"

echo "✅ 인증서: /etc/letsencrypt/live/$CERT_NAME/"
