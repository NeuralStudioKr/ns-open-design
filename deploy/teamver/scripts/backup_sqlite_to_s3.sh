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
backup_sqlite_to_s3.sh — fallback OD app.sqlite backup to S3 (09 P2-3)

  bash scripts/backup_sqlite_to_s3.sh --staging --stop-daemon
  bash scripts/backup_sqlite_to_s3.sh --production --stop-daemon
  bash scripts/backup_sqlite_to_s3.sh --staging --allow-live-copy --dry-run

Flags:
  --staging | --production         pick deploy/teamver/.env.<env>
  --stop-daemon                    stop open-design-daemon for offline copy
  --allow-live-copy                copy live (no consistency guarantee)
  --prefix <s3-prefix>             override SQLITE_BACKUP_PREFIX (default: sqlite-backups)
  --dry-run                        echo docker / aws commands without executing
  -h | --help

Requires:
  - aws CLI (real run)
  - docker compose service `open-design-daemon` (real run)
  - LITESTREAM_BUCKET or OD_S3_BUCKET in the selected env file

Notes:
  - Normal path is Litestream replication. This fallback copies app.sqlite
    (+wal/shm) into s3://<bucket>/<SQLITE_BACKUP_PREFIX>/<env>/<timestamp>/
    plus an in-place LATEST.json manifest for restore.
  - Use --stop-daemon for a consistent offline copy. --allow-live-copy is
    for emergency runbooks only.
  - --dry-run is fully offline: aws/docker are NOT invoked, commands print as
    `DRYRUN: …` so the fixture (test_backup_sqlite_to_s3.sh) can lock the
    contract without credentials.
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
  if [[ "$DRY_RUN" != true ]]; then
    echo "❌ docker CLI 필요"
    exit 1
  fi
fi

if ! command -v aws >/dev/null 2>&1; then
  if [[ "$DRY_RUN" != true ]]; then
    echo "❌ aws CLI 필요 (또는 --dry-run으로 명령만 출력)"
    exit 1
  fi
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

dest="s3://${BUCKET}/${BACKUP_PREFIX}/${ENV_NAME}/${ts}/"
latest="s3://${BUCKET}/${BACKUP_PREFIX}/${ENV_NAME}/LATEST.json"

echo "==> mode=fallback env=$ENV_NAME bucket=$BUCKET region=$REGION dest=$dest"

if [[ "$STOP_DAEMON" == true ]]; then
  echo "==> stopping open-design-daemon for offline sqlite copy"
  if [[ "$DRY_RUN" != true ]]; then
    docker compose --env-file "$ENV_FILE" stop open-design-daemon >/dev/null
    restore_needed=true
  else
    echo "DRYRUN: docker compose --env-file $ENV_FILE stop open-design-daemon"
  fi
fi

echo "==> copying app.sqlite bundle from open-design-daemon"
if [[ "$DRY_RUN" == true ]]; then
  echo "DRYRUN: docker compose --env-file $ENV_FILE cp open-design-daemon:/app/.od/app.sqlite{,-wal,-shm} $tmp_dir/"
else
  docker compose --env-file "$ENV_FILE" cp \
    open-design-daemon:/app/.od/app.sqlite "$tmp_dir/app.sqlite" >/dev/null
  docker compose --env-file "$ENV_FILE" cp \
    open-design-daemon:/app/.od/app.sqlite-wal "$tmp_dir/app.sqlite-wal" >/dev/null 2>&1 || true
  docker compose --env-file "$ENV_FILE" cp \
    open-design-daemon:/app/.od/app.sqlite-shm "$tmp_dir/app.sqlite-shm" >/dev/null 2>&1 || true
fi

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

echo "==> uploading to $dest"
if [[ "$DRY_RUN" == true ]]; then
  echo "DRYRUN: aws s3 cp $tmp_dir/ $dest --recursive --region $REGION"
  echo "DRYRUN: aws s3 cp $tmp_dir/manifest.json $latest --region $REGION"
else
  aws s3 cp "$tmp_dir/" "$dest" --recursive --region "$REGION"
  aws s3 cp "$tmp_dir/manifest.json" "$latest" --region "$REGION"
fi

echo "✓ sqlite fallback backup prepared: $dest"
