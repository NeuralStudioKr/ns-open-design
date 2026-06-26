#!/usr/bin/env bash
# Teamver Design — RDS registry vs S3 tenant object drift audit.
#
# Lists active design_projects rows whose s3_prefix has zero objects in the
# project-data bucket. Useful for staging E2E probe target selection and
# post-migration backfill planning (09 §13).
#
# Usage:
#   bash scripts/check_registry_s3_drift.sh --staging
#   bash scripts/check_registry_s3_drift.sh --staging --limit 50
#   MAIN_BE_DATABASE_URL=postgresql://… bash scripts/check_registry_s3_drift.sh --staging
#
# Requires: psql, aws CLI (unless CHECK_S3=0), MAIN_BE_DATABASE_URL or RDS_* in .env

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV_FILE=""
ENV_LABEL=""
LIMIT=0
CHECK_S3=1
FAIL_ON_DRIFT=0

usage() {
  cat <<'EOF'
check_registry_s3_drift.sh — RDS active projects vs S3 tenant prefix objects

  bash scripts/check_registry_s3_drift.sh --staging
  bash scripts/check_registry_s3_drift.sh --production [--limit N]

Options:
  --limit N           inspect at most N projects (0 = all, default)
  --skip-s3           RDS listing only (no aws s3 ls)
  --fail-on-drift     exit 1 when any registry-only (S3 empty) row exists

ENV (from .env.staging / .env.production or shell):
  MAIN_BE_DATABASE_URL / DATABASE_URL
  OD_S3_BUCKET or TEAMVER_S3_BUCKET
EOF
}

while (( $# )); do
  case "$1" in
    --staging) ENV_FILE=".env.staging"; ENV_LABEL=staging ;;
    --production) ENV_FILE=".env.production"; ENV_LABEL=production ;;
    --limit)
      shift
      LIMIT="${1:?--limit requires a number}"
      ;;
    --skip-s3) CHECK_S3=0 ;;
    --fail-on-drift) FAIL_ON_DRIFT=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ -z "$ENV_FILE" ]]; then
  echo "❌ --staging 또는 --production 필요"
  usage
  exit 1
fi

ENV_PATH="$ROOT/$ENV_FILE"
if [[ ! -f "$ENV_PATH" ]]; then
  echo "❌ $ENV_PATH 없음"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_PATH"
set +a

DB_URL="${MAIN_BE_DATABASE_URL:-${DATABASE_URL:-}}"
S3_BUCKET="${TEAMVER_S3_BUCKET:-${OD_S3_BUCKET:-}}"

if [[ -z "$DB_URL" ]]; then
  echo "❌ MAIN_BE_DATABASE_URL 또는 DATABASE_URL 필요"
  exit 1
fi

if [[ "$CHECK_S3" == "1" && -z "$S3_BUCKET" ]]; then
  echo "❌ OD_S3_BUCKET 또는 TEAMVER_S3_BUCKET 필요 (--skip-s3 로 RDS만 조회 가능)"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "❌ psql 미설치"
  exit 1
fi

if [[ "$CHECK_S3" == "1" ]] && ! command -v aws >/dev/null 2>&1; then
  echo "❌ aws CLI 미설치 (--skip-s3 로 우회 가능)"
  exit 1
fi

echo "=== registry ↔ S3 drift ($ENV_LABEL) bucket=${S3_BUCKET:-n/a} ==="

with_objects=0
empty=0
skipped=0

limit_clause=""
if [[ "$LIMIT" -gt 0 ]]; then
  limit_clause="LIMIT $LIMIT"
fi

mapfile -t ROWS < <(
  psql "$DB_URL" -At -F $'\t' -c \
    "SELECT id, od_project_id, s3_prefix
     FROM design_projects
     WHERE status = 'active'
     ORDER BY updated_at DESC
     ${limit_clause};"
)

total="${#ROWS[@]}"

for row in "${ROWS[@]}"; do
  [[ -z "$row" ]] && continue
  IFS=$'\t' read -r dprj od_id prefix <<< "$row"
  prefix="${prefix%/}/"

  if [[ "$CHECK_S3" != "1" ]]; then
    echo "○ $dprj od=$od_id prefix=$prefix (S3 check skipped)"
    skipped=$((skipped + 1))
    continue
  fi

  count="$(aws s3 ls "s3://${S3_BUCKET}/${prefix}" --recursive 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${count:-0}" -gt 0 ]]; then
    echo "✓ $dprj od=$od_id objects=$count"
    with_objects=$((with_objects + 1))
  else
    echo "✗ $dprj od=$od_id — registry only (S3 prefix empty)"
    empty=$((empty + 1))
  fi
done

echo "---"
echo "active=$total s3_nonempty=$with_objects s3_empty=$empty skipped=$skipped"

if [[ "$FAIL_ON_DRIFT" == "1" && "$empty" -gt 0 ]]; then
  echo "❌ drift detected ($empty project(s) without S3 objects)"
  exit 1
fi

if [[ "$empty" -gt 0 ]]; then
  echo "○ drift present — E2E S3 probe는 s3_nonempty 프로젝트 사용 또는 backfill (09 §13)"
  exit 0
fi

echo "✓ all inspected projects have S3 objects"
exit 0
