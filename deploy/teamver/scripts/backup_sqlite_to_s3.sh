#!/usr/bin/env bash
# Fallback app.sqlite backup for 09 P2-3.
#
# Prefer Litestream for normal operation. Use this only when Litestream is not
# available and you can accept a short daemon stop window.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE=""
STOP_DAEMON=false
ALLOW_LIVE_COPY=false
DRY_RUN=false
BACKUP_PREFIX="${SQLITE_BACKUP_PREFIX:-sqlite-backups}"

usage() {
  cat <<'EOF'
backup_sqlite_to_s3.sh — fallback OD app.sqlite backup to S3

  bash scripts/backup_sqlite_to_s3.sh --staging --stop-daemon
  bash scripts/backup_sqlite_to_s3.sh --production --stop-daemon
  bash scripts/backup_sqlite_to_s3.sh --staging --allow-live-copy --dry-run

Requires:
  - AWS CLI on the host
  - docker compose service `open-design-daemon`
  - LITESTREAM_BUCKET or OD_S3_BUCKET in the selected env file

Notes:
  - Normal path is Litestream. This fallback copies app.sqlite(+wal/shm) into
    s3://<bucket>/<SQLITE_BACKUP_PREFIX>/<env>/<timestamp>/.
  - Use --stop-daemon for a consistent offline copy.
EOF
}

while (( $# )); do
  case "$1" in
    --staging) ENV_FILE=".env.staging" ;;
    --production) ENV_FILE=".env.production" ;;
    --prefix) BACKUP_PREFIX="${2:?--prefix requires a value}"; shift ;;
    --stop-daemon) STOP_DAEMON=true ;;
    --allow-live-copy) ALLOW_LIVE_COPY=true ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ -z "$ENV_FILE" ]]; then
  echo "❌ --staging 또는 --production 필요"
  usage
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE 없음"
  exit 1
fi

if [[ "$STOP_DAEMON" != true && "$ALLOW_LIVE_COPY" != true ]]; then
  echo "❌ consistency 보호: --stop-daemon 권장, live copy는 --allow-live-copy 명시 필요"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker CLI 필요"
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "❌ aws CLI 필요"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

BUCKET="${LITESTREAM_BUCKET:-${OD_S3_BUCKET:-}}"
REGION="${LITESTREAM_REGION:-${OD_S3_REGION:-${AWS_REGION:-ap-northeast-2}}}"
ENV_NAME="${ENV:-$([[ "$ENV_FILE" == ".env.staging" ]] && echo staging || echo production)}"

if [[ -z "${BUCKET// }" ]]; then
  echo "❌ LITESTREAM_BUCKET 또는 OD_S3_BUCKET 필요 ($ENV_FILE)"
  exit 1
fi

ts="$(date -u '+%Y%m%dT%H%M%SZ')"
tmp_dir="$(mktemp -d)"
restore_needed=false

cleanup() {
  rm -rf "$tmp_dir"
  if [[ "$restore_needed" == true ]]; then
    docker compose --env-file "$ENV_FILE" start open-design-daemon >/dev/null
  fi
}
trap cleanup EXIT

if [[ "$STOP_DAEMON" == true ]]; then
  echo "==> stopping open-design-daemon for offline sqlite copy"
  docker compose --env-file "$ENV_FILE" stop open-design-daemon >/dev/null
  restore_needed=true
fi

echo "==> copying app.sqlite bundle from open-design-daemon"
docker compose --env-file "$ENV_FILE" cp \
  open-design-daemon:/app/.od/app.sqlite "$tmp_dir/app.sqlite" >/dev/null
docker compose --env-file "$ENV_FILE" cp \
  open-design-daemon:/app/.od/app.sqlite-wal "$tmp_dir/app.sqlite-wal" >/dev/null 2>&1 || true
docker compose --env-file "$ENV_FILE" cp \
  open-design-daemon:/app/.od/app.sqlite-shm "$tmp_dir/app.sqlite-shm" >/dev/null 2>&1 || true

cat > "$tmp_dir/manifest.json" <<EOF
{
  "createdAt": "$ts",
  "env": "$ENV_NAME",
  "source": "backup_sqlite_to_s3.sh",
  "consistent": $([[ "$STOP_DAEMON" == true ]] && echo true || echo false),
  "bucket": "$BUCKET",
  "prefix": "$BACKUP_PREFIX/$ENV_NAME/$ts"
}
EOF

dest="s3://${BUCKET}/${BACKUP_PREFIX}/${ENV_NAME}/${ts}/"
latest="s3://${BUCKET}/${BACKUP_PREFIX}/${ENV_NAME}/LATEST.json"

echo "==> uploading to $dest"
if [[ "$DRY_RUN" == true ]]; then
  aws s3 cp "$tmp_dir/" "$dest" --recursive --region "$REGION" --dryrun
  aws s3 cp "$tmp_dir/manifest.json" "$latest" --region "$REGION" --dryrun
else
  aws s3 cp "$tmp_dir/" "$dest" --recursive --region "$REGION"
  aws s3 cp "$tmp_dir/manifest.json" "$latest" --region "$REGION"
fi

echo "✓ sqlite fallback backup prepared: $dest"
