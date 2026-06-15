#!/usr/bin/env bash
set -euo pipefail

# Teamver Design — Production EC2 Nginx apply (AWS ALB 백엔드 HTTP conf)
# Staging: apply_teamver_design_staging_nginx_conf.sh

usage() {
  cat <<'EOF'
apply_teamver_design_nginx_conf.sh — Production VM (design.teamver.com.http.conf)

  sudo ./apply_teamver_design_nginx_conf.sh ./design.teamver.com.http.conf

Staging 은 apply_teamver_design_staging_nginx_conf.sh 사용.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_SRC_PATH="$SCRIPT_DIR/design.teamver.com.http.conf"

SRC_PATH=""
DISABLE_NAMES=()
while (( $# )); do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --disable)
      shift
      if [[ -z "${1:-}" ]]; then
        echo "❌ --disable 값이 없습니다."
        exit 1
      fi
      DISABLE_NAMES+=("$1")
      shift
      ;;
    --*)
      echo "❌ 알 수 없는 옵션: $1"
      usage
      exit 1
      ;;
    *)
      if [[ -n "$SRC_PATH" ]]; then
        echo "❌ conf 경로는 하나만 지정하세요."
        exit 1
      fi
      SRC_PATH="$1"
      shift
      ;;
  esac
done

SRC_PATH="${SRC_PATH:-$DEFAULT_SRC_PATH}"
CONF_NAME="$(basename "$SRC_PATH")"
SITES_AVAILABLE_DIR="/etc/nginx/sites-available"
SITES_ENABLED_DIR="/etc/nginx/sites-enabled"
TARGET_AVAILABLE_PATH="$SITES_AVAILABLE_DIR/$CONF_NAME"
TARGET_ENABLED_PATH="$SITES_ENABLED_DIR/$CONF_NAME"
BACKUP_DIR="/etc/nginx/backup_$(date +%Y%m%d_%H%M%S)"

if [[ $EUID -ne 0 ]]; then
  echo "❌ root(sudo)로 실행하세요."
  exit 1
fi

if [[ ! -f "$SRC_PATH" ]]; then
  echo "❌ 파일 없음: $SRC_PATH"
  exit 1
fi

if [[ ! -d "$SITES_AVAILABLE_DIR" || ! -d "$SITES_ENABLED_DIR" ]]; then
  echo "❌ Nginx sites 디렉터리가 없습니다: $SITES_AVAILABLE_DIR"
  exit 1
fi

mkdir -p "$BACKUP_DIR/sites-available" "$BACKUP_DIR/sites-enabled" "$BACKUP_DIR/conf.d"
shopt -s nullglob
conf_d_files=(/etc/nginx/conf.d/*.conf)
avail_files=("$SITES_AVAILABLE_DIR"/*.conf)
enabled_files=("$SITES_ENABLED_DIR"/*.conf)
shopt -u nullglob
if (( ${#conf_d_files[@]} )); then cp -a "${conf_d_files[@]}" "$BACKUP_DIR/conf.d/"; fi
if (( ${#avail_files[@]} )); then cp -a "${avail_files[@]}" "$BACKUP_DIR/sites-available/"; fi
if (( ${#enabled_files[@]} )); then cp -a "${enabled_files[@]}" "$BACKUP_DIR/sites-enabled/"; fi
echo "🗂️ 백업: $BACKUP_DIR"

if (( ${#DISABLE_NAMES[@]} )); then
  mkdir -p "$BACKUP_DIR/disabled-sites-enabled"
  for name in "${DISABLE_NAMES[@]}"; do
    p="$SITES_ENABLED_DIR/$name"
    if [[ -e "$p" ]]; then
      mv -f "$p" "$BACKUP_DIR/disabled-sites-enabled/"
      echo "🧹 비활성화(이동): $p"
    else
      echo "⚠️ sites-enabled 에 없음(건너뜀): $p"
    fi
  done
fi

cp "$SRC_PATH" "$TARGET_AVAILABLE_PATH"
ln -sfn "$TARGET_AVAILABLE_PATH" "$TARGET_ENABLED_PATH"
echo "📄 적용됨: $TARGET_ENABLED_PATH"

nginx -t
systemctl reload nginx
echo "✅ 완료."
