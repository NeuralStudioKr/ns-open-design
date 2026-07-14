#!/usr/bin/env bash
# OD `app.sqlite` restore from S3 (Litestream replica or fallback snapshot).
#
# Covers docs-teamver/09 Phase 2 P2-2 (restore runbook). Two paths:
#
#   1) Litestream replica (preferred) — `litestream restore` re-creates
#      app.sqlite at the requested timestamp/generation. Default.
#   2) Fallback snapshot — `backup_sqlite_to_s3.sh` produced
#      s3://<bucket>/<SQLITE_BACKUP_PREFIX>/<env>/<timestamp>/. Use
#      `--from-snapshot` (path or `LATEST.json` will resolve the newest).
#
# Always operates against an EMPTY restore target (default `./restore/<env>/<ts>`)
# so the script never overwrites a running app.sqlite by accident. A separate
# `--apply` step is required to copy the restored file into the daemon volume
# (and only when the daemon is stopped).
#
# Usage:
#   bash scripts/restore_app_sqlite_from_s3.sh --staging --dry-run
#   bash scripts/restore_app_sqlite_from_s3.sh --staging --litestream
#   bash scripts/restore_app_sqlite_from_s3.sh --staging --litestream --at 2026-06-17T12:00:00Z
#   bash scripts/restore_app_sqlite_from_s3.sh --staging --from-snapshot LATEST.json
#   bash scripts/restore_app_sqlite_from_s3.sh --production --litestream --apply
#
# Requires: aws CLI on the host (always); `litestream` CLI for --litestream;
# `docker compose` (only for --apply, to copy the restored DB into the
# open-design-daemon container).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE=""
MODE="litestream"
SNAPSHOT_REF=""
AT_TIMESTAMP=""
GENERATION=""
TARGET_DIR=""
APPLY=false
DRY_RUN=false
BACKUP_PREFIX_OVERRIDE=""
REPLICA_ID=""
REPLICA_PATH_OVERRIDE=""
LITESTREAM_BIN="${LITESTREAM_BIN:-litestream}"

usage() {
  cat <<'EOF'
restore_app_sqlite_from_s3.sh — Litestream + fallback restore for OD app.sqlite

  --staging                       use deploy/teamver/.env.staging
  --production                    use deploy/teamver/.env.production
  --litestream                    restore via `litestream restore` (default)
  --from-snapshot <ref>           restore fallback snapshot from
                                  s3://<bucket>/<SQLITE_BACKUP_PREFIX>/<env>/<ts>/
                                  <ref> may be the timestamp dir, full s3:// URI,
                                  or `LATEST.json` to resolve newest.
  --at <ISO8601>                  litestream point-in-time (RFC3339 / -timestamp)
  --generation <id>               litestream generation (-generation)
  --target-dir <path>             output dir (default: restore/<env>/<ts>/)
  --prefix <s3-prefix>            override SQLITE_BACKUP_PREFIX for --from-snapshot
  --replica-id <node-id>          multi-node (docs-teamver/39_3 §5.2): restore
                                  the replica written by this specific EC2
                                  node (deploy.sh writes to
                                  s3://<bucket>/litestream/<sanitized-node-id>/
                                  app.sqlite). Node id is lower-kebab-sanitised
                                  the same way deploy.sh does it.
  --replica-path <s3-path>        low-level override — full replica path under
                                  the bucket (e.g. litestream/i-0abc/app.sqlite).
                                  Wins over --replica-id.
  --apply                         after restore, copy app.sqlite into the
                                  open-design-daemon container (daemon must
                                  be stopped first; aborts if daemon running)
  --dry-run                       print commands without executing aws/litestream
  -h | --help

Notes:
  • Bucket + region come from LITESTREAM_BUCKET / LITESTREAM_REGION in the
    selected .env file (mirrors litestream.yml).
  • Legacy single-node replicas live at litestream/app.sqlite; multi-node (Phase 4)
    writers use litestream/<node-id>/app.sqlite. Pass --replica-id or --replica-path
    to target a specific node — otherwise the legacy path is used.
  • Fallback path reads manifest.json + (app.sqlite, app.sqlite-wal, app.sqlite-shm).
  • Restored bundle never replaces /data/app.sqlite unless --apply is passed.
  • --apply will refuse to run while open-design-daemon is up.
EOF
}

while (( $# )); do
  case "$1" in
    --staging) ENV_FILE=".env.staging" ;;
    --production) ENV_FILE=".env.production" ;;
    --litestream) MODE="litestream" ;;
    --from-snapshot) MODE="snapshot"; SNAPSHOT_REF="${2:?--from-snapshot requires a value}"; shift ;;
    --at) AT_TIMESTAMP="${2:?--at requires a value}"; shift ;;
    --generation) GENERATION="${2:?--generation requires a value}"; shift ;;
    --target-dir) TARGET_DIR="${2:?--target-dir requires a value}"; shift ;;
    --prefix) BACKUP_PREFIX_OVERRIDE="${2:?--prefix requires a value}"; shift ;;
    --replica-id) REPLICA_ID="${2:?--replica-id requires a value}"; shift ;;
    --replica-path) REPLICA_PATH_OVERRIDE="${2:?--replica-path requires a value}"; shift ;;
    --apply) APPLY=true ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ -z "$ENV_FILE" ]]; then
  echo "❌ --staging or --production required"
  usage
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE not found (expected under $(pwd))"
  exit 1
fi

# shellcheck source=lib/design_compose.sh
source "$ROOT/scripts/lib/design_compose.sh"
design_compose_build_args "$ROOT" "$ENV_FILE"

if [[ "$MODE" == "snapshot" && -z "$SNAPSHOT_REF" ]]; then
  echo "❌ --from-snapshot requires a reference (timestamp, s3:// URI, or LATEST.json)"
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  if [[ "$DRY_RUN" != true ]]; then
    echo "❌ aws CLI required (or use --dry-run to inspect commands)"
    exit 1
  fi
fi

if [[ "$MODE" == "litestream" ]]; then
  if ! command -v "$LITESTREAM_BIN" >/dev/null 2>&1; then
    if [[ "$DRY_RUN" != true ]]; then
      echo "❌ litestream CLI required (set LITESTREAM_BIN=/path/to/litestream to override, or use --dry-run)"
      exit 1
    fi
  fi
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

BUCKET="${LITESTREAM_BUCKET:-${OD_S3_BUCKET:-}}"
REGION="${LITESTREAM_REGION:-${OD_S3_REGION:-${AWS_REGION:-ap-northeast-2}}}"
ENV_NAME="${ENV:-$([[ "$ENV_FILE" == ".env.staging" ]] && echo staging || echo production)}"
BACKUP_PREFIX="${BACKUP_PREFIX_OVERRIDE:-${SQLITE_BACKUP_PREFIX:-sqlite-backups}}"

if [[ -z "${BUCKET// }" ]]; then
  echo "❌ LITESTREAM_BUCKET or OD_S3_BUCKET required in $ENV_FILE"
  exit 1
fi

ts="$(date -u '+%Y%m%dT%H%M%SZ')"
TARGET_DIR="${TARGET_DIR:-restore/${ENV_NAME}/${ts}}"
mkdir -p "$TARGET_DIR"

run() {
  if [[ "$DRY_RUN" == true ]]; then
    echo "DRYRUN: $*"
  else
    "$@"
  fi
}

echo "==> mode=$MODE env=$ENV_NAME bucket=$BUCKET region=$REGION target=$TARGET_DIR"

if [[ "$MODE" == "litestream" ]]; then
  litestream_args=(
    restore
    -o "$TARGET_DIR/app.sqlite"
    -config /dev/null
  )
  # Build replica URL directly so we don't need litestream.yml on the
  # restore host. Multi-node (docs-teamver/39_3 §5.2): --replica-id or
  # --replica-path targets a specific node's replica prefix. Sanitise
  # --replica-id exactly the same way deploy.sh does when it derives
  # LITESTREAM_REPLICA_PATH from OD_NODE_ID so the paths line up.
  replica_subpath="litestream/app.sqlite"
  if [[ -n "$REPLICA_PATH_OVERRIDE" ]]; then
    replica_subpath="${REPLICA_PATH_OVERRIDE#/}"
  elif [[ -n "$REPLICA_ID" ]]; then
    sanitized_replica_id="$(
      printf '%s' "$REPLICA_ID" |
        tr '[:upper:]' '[:lower:]' |
        tr -cs 'a-z0-9-' '-' |
        sed -E 's/^-+//; s/-+$//'
    )"
    if [[ -z "$sanitized_replica_id" || "$sanitized_replica_id" == "unknown" ]]; then
      echo "❌ --replica-id sanitises to empty/unknown; refusing to fall back to legacy path"
      exit 1
    fi
    replica_subpath="litestream/${sanitized_replica_id}/app.sqlite"
  fi
  REPLICA_URL="s3://${BUCKET}/${replica_subpath}"
  echo "==> replica_url=$REPLICA_URL"
  if [[ -n "$AT_TIMESTAMP" ]]; then
    litestream_args+=( -timestamp "$AT_TIMESTAMP" )
  fi
  if [[ -n "$GENERATION" ]]; then
    litestream_args+=( -generation "$GENERATION" )
  fi
  AWS_REGION="$REGION" run "$LITESTREAM_BIN" "${litestream_args[@]}" "$REPLICA_URL"
  echo "✓ litestream restored → $TARGET_DIR/app.sqlite"

elif [[ "$MODE" == "snapshot" ]]; then
  snap_dir="$SNAPSHOT_REF"
  # Resolve LATEST.json if given.
  if [[ "$SNAPSHOT_REF" == "LATEST.json" || "$SNAPSHOT_REF" == "LATEST" ]]; then
    latest_uri="s3://${BUCKET}/${BACKUP_PREFIX}/${ENV_NAME}/LATEST.json"
    tmp_latest="$(mktemp)"
    if [[ "$DRY_RUN" == true ]]; then
      echo "DRYRUN: aws s3 cp $latest_uri $tmp_latest --region $REGION"
      snap_dir="(latest-resolved-at-runtime)"
    else
      aws s3 cp "$latest_uri" "$tmp_latest" --region "$REGION" >/dev/null
      snap_dir="$(grep -oE '"prefix"\s*:\s*"[^"]+"' "$tmp_latest" | sed -E 's/.*"prefix"\s*:\s*"([^"]+)".*/\1/')"
      rm -f "$tmp_latest"
      if [[ -z "$snap_dir" ]]; then
        echo "❌ could not parse manifest prefix from $latest_uri"
        exit 1
      fi
      snap_dir="s3://${BUCKET}/${snap_dir}"
    fi
  fi
  if [[ "$snap_dir" != s3://* ]]; then
    # Allow "20260617T120000Z" shorthand by joining with default layout.
    snap_dir="s3://${BUCKET}/${BACKUP_PREFIX}/${ENV_NAME}/${snap_dir%/}/"
  fi
  echo "==> pulling $snap_dir"
  run aws s3 cp "$snap_dir" "$TARGET_DIR/" --recursive --region "$REGION"
  if [[ "$DRY_RUN" != true ]]; then
    if [[ ! -f "$TARGET_DIR/app.sqlite" ]]; then
      echo "❌ snapshot dir missing app.sqlite ($snap_dir)"
      exit 1
    fi
    echo "✓ snapshot restored → $TARGET_DIR/app.sqlite (manifest: $TARGET_DIR/manifest.json)"
  fi
fi

if [[ "$APPLY" == true ]]; then
  if [[ "$DRY_RUN" == true ]]; then
    echo "DRYRUN: would verify open-design-daemon stopped, then $(design_compose_cmd_str) cp …"
  else
    if ! command -v docker >/dev/null 2>&1; then
      echo "❌ --apply requires docker CLI"
      exit 1
    fi
    status="$("${DESIGN_COMPOSE_ARGS[@]}" ps -q open-design-daemon 2>/dev/null || true)"
    if [[ -n "$status" ]]; then
      running="$(docker inspect -f '{{.State.Running}}' "$status" 2>/dev/null || echo unknown)"
      if [[ "$running" == "true" ]]; then
        echo "❌ open-design-daemon is running — stop it first ($(design_compose_cmd_str) stop open-design-daemon)"
        exit 1
      fi
    fi
    echo "==> copying restored app.sqlite into open-design-daemon container"
    "${DESIGN_COMPOSE_ARGS[@]}" cp \
      "$TARGET_DIR/app.sqlite" open-design-daemon:/app/.od/app.sqlite
    for side in app.sqlite-wal app.sqlite-shm; do
      if [[ -f "$TARGET_DIR/$side" ]]; then
        "${DESIGN_COMPOSE_ARGS[@]}" cp \
          "$TARGET_DIR/$side" "open-design-daemon:/app/.od/$side"
      fi
    done
    echo "✓ restored bundle applied — start daemon: $(design_compose_cmd_str) up -d open-design-daemon"
  fi
fi
