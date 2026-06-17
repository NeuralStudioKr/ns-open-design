#!/usr/bin/env bash
# Print / apply the S3 lifecycle policy for the OD project-data bucket.
#
# Covers docs-teamver/09 P3-8 (S3 lifecycle ☐) + general cost hygiene.
# Three rules, all scoped by prefix so we never touch active project blobs:
#
#   1. abort-incomplete-multipart   bucket-wide (no Filter) — 7d
#      Cleans up dangling multipart uploads from interrupted uploads.
#
#   2. sqlite-backups-expire        Filter Prefix=<SQLITE_BACKUP_PREFIX>/
#      Expires fallback snapshots (`backup_sqlite_to_s3.sh`) after
#      $S3_LIFECYCLE_SQLITE_BACKUP_DAYS days (default 30). Litestream
#      replicas under `litestream/` are intentionally NOT touched —
#      Litestream needs the full generation history to do PITR.
#
#   3. scratch-evict-expire         Filter Prefix=$OD_S3_PREFIX$S3_LIFECYCLE_SCRATCH_PREFIX/
#      Expires daemon scratch debris (e.g. `${OD_S3_PREFIX}_scratch/`
#      / `${OD_S3_PREFIX}_deleted/` orphans from soft-deleted projects)
#      after $S3_LIFECYCLE_SCRATCH_DAYS days (default 14). Disabled when
#      $S3_LIFECYCLE_SCRATCH_PREFIX is empty.
#
# Usage:
#   bash scripts/s3_lifecycle_policy.sh --staging                # print JSON
#   bash scripts/s3_lifecycle_policy.sh --staging --apply        # put policy
#   bash scripts/s3_lifecycle_policy.sh --staging --dry-run --apply
#   bash scripts/s3_lifecycle_policy.sh --staging --diff         # show vs live
#
# Required env (in .env.staging / .env.production):
#   LITESTREAM_BUCKET or OD_S3_BUCKET   target bucket
#   OD_S3_PREFIX                        active project prefix (e.g. `design/`)
# Optional:
#   SQLITE_BACKUP_PREFIX                default `sqlite-backups`
#   S3_LIFECYCLE_SQLITE_BACKUP_DAYS     default `30`
#   S3_LIFECYCLE_SCRATCH_PREFIX         default `_deleted` (empty = disabled)
#   S3_LIFECYCLE_SCRATCH_DAYS           default `14`

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE=""
APPLY=false
DRY_RUN=false
DIFF=false

usage() {
  sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
}

while (( $# )); do
  case "$1" in
    --staging) ENV_FILE=".env.staging" ;;
    --production) ENV_FILE=".env.production" ;;
    --apply) APPLY=true ;;
    --dry-run) DRY_RUN=true ;;
    --diff) DIFF=true ;;
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
  echo "❌ $ENV_FILE not found under $(pwd)"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

BUCKET="${LITESTREAM_BUCKET:-${OD_S3_BUCKET:-}}"
REGION="${LITESTREAM_REGION:-${OD_S3_REGION:-${AWS_REGION:-ap-northeast-2}}}"
ACTIVE_PREFIX="${OD_S3_PREFIX:-design/}"
BACKUP_PREFIX="${SQLITE_BACKUP_PREFIX:-sqlite-backups}"
BACKUP_DAYS="${S3_LIFECYCLE_SQLITE_BACKUP_DAYS:-30}"
SCRATCH_SUBPREFIX="${S3_LIFECYCLE_SCRATCH_PREFIX-_deleted}"
SCRATCH_DAYS="${S3_LIFECYCLE_SCRATCH_DAYS:-14}"

if [[ -z "${BUCKET// }" ]]; then
  echo "❌ LITESTREAM_BUCKET or OD_S3_BUCKET required in $ENV_FILE"
  exit 1
fi
if [[ -z "${ACTIVE_PREFIX// }" ]]; then
  echo "❌ OD_S3_PREFIX required in $ENV_FILE (default design/)"
  exit 1
fi
# Make sure prefixes end with /.
[[ "$ACTIVE_PREFIX" != */ ]] && ACTIVE_PREFIX="${ACTIVE_PREFIX}/"
[[ "$BACKUP_PREFIX" != */ ]] && BACKUP_PREFIX="${BACKUP_PREFIX}/"

build_policy() {
  local include_scratch=true
  if [[ -z "${SCRATCH_SUBPREFIX// }" ]]; then
    include_scratch=false
  fi

  local scratch_rule=""
  if [[ "$include_scratch" == true ]]; then
    local scratch_prefix="${ACTIVE_PREFIX}${SCRATCH_SUBPREFIX}/"
    scratch_rule=$(cat <<EOF
    ,{
      "ID": "od-scratch-evict-expire",
      "Status": "Enabled",
      "Filter": {"Prefix": "$scratch_prefix"},
      "Expiration": {"Days": $SCRATCH_DAYS},
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}
    }
EOF
)
  fi

  cat <<EOF
{
  "Rules": [
    {
      "ID": "od-abort-incomplete-multipart",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
    },
    {
      "ID": "od-sqlite-backups-expire",
      "Status": "Enabled",
      "Filter": {"Prefix": "$BACKUP_PREFIX"},
      "Expiration": {"Days": $BACKUP_DAYS},
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}
    }$scratch_rule
  ]
}
EOF
}

POLICY="$(build_policy)"

echo "==> bucket=$BUCKET region=$REGION"
echo "==> active=$ACTIVE_PREFIX backup=$BACKUP_PREFIX backup_days=$BACKUP_DAYS"
if [[ -n "${SCRATCH_SUBPREFIX// }" ]]; then
  echo "==> scratch=${ACTIVE_PREFIX}${SCRATCH_SUBPREFIX}/ scratch_days=$SCRATCH_DAYS"
else
  echo "==> scratch rule DISABLED (S3_LIFECYCLE_SCRATCH_PREFIX empty)"
fi

if [[ "$DIFF" == true ]]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "❌ aws CLI required for --diff"
    exit 1
  fi
  live="$(aws s3api get-bucket-lifecycle-configuration \
    --bucket "$BUCKET" --region "$REGION" 2>/dev/null || echo '{"Rules":[]}')"
  if command -v diff >/dev/null 2>&1; then
    diff <(echo "$live") <(echo "$POLICY") || true
  else
    echo "--- LIVE ---"; echo "$live"
    echo "--- LOCAL ---"; echo "$POLICY"
  fi
  exit 0
fi

if [[ "$APPLY" == true ]]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "❌ aws CLI required for --apply"
    exit 1
  fi
  tmp="$(mktemp)"
  echo "$POLICY" > "$tmp"
  if [[ "$DRY_RUN" == true ]]; then
    echo "DRYRUN: aws s3api put-bucket-lifecycle-configuration \\"
    echo "         --bucket $BUCKET --region $REGION \\"
    echo "         --lifecycle-configuration file://$tmp"
    cat "$tmp"
    rm -f "$tmp"
    exit 0
  fi
  aws s3api put-bucket-lifecycle-configuration \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --lifecycle-configuration "file://$tmp"
  rm -f "$tmp"
  echo "✓ lifecycle policy applied to s3://$BUCKET"
else
  echo "$POLICY"
fi
