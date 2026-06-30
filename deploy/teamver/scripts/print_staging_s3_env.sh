#!/usr/bin/env bash
# Print staging terraform → .env.staging lines (RDS + S3 + Litestream hints).
#
# Usage:
#   bash scripts/print_staging_s3_env.sh
#   bash scripts/print_staging_s3_env.sh --from-terraform
#
# --from-terraform: read ns-teamver-devops/terraform/services/teamver-design staging outputs

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="${TEAMVER_DESIGN_TF_DIR:-$ROOT/../../../ns-teamver-devops/terraform/services/teamver-design}"

FROM_TF=false
while (( $# )); do
  case "$1" in
    --from-terraform) FROM_TF=true ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
  shift
done

bucket="${OD_S3_BUCKET:-teamver-design-staging-data}"
region="${OD_S3_REGION:-ap-northeast-2}"
prefix="${OD_S3_PREFIX:-design/}"
postgres_host=""
postgres_user=""
postgres_db="${POSTGRES_DB:-teamver_design_staging}"

if [[ "$FROM_TF" == true && -d "$TF_DIR" ]]; then
  if command -v terraform >/dev/null 2>&1; then
    pushd "$TF_DIR" >/dev/null
    if terraform output -json project_data_bucket >/dev/null 2>&1; then
      bucket="$(terraform output -raw project_data_bucket)"
      region="$(terraform output -raw project_data_s3_region 2>/dev/null || echo "$region")"
      prefix="$(terraform output -raw project_data_s3_prefix 2>/dev/null || echo "$prefix")"
      postgres_host="$(terraform output -raw postgres_host 2>/dev/null || true)"
      postgres_user="$(terraform output -raw postgres_username 2>/dev/null || true)"
      db_sql="$(terraform output -raw rds_create_database_sql 2>/dev/null || true)"
      if [[ -n "$db_sql" && "$db_sql" != "null" ]]; then
        parsed_db="$(printf '%s' "$db_sql" | sed -n 's/^CREATE DATABASE \([^ ]*\).*/\1/p')"
        if [[ -n "$parsed_db" ]]; then
          postgres_db="$parsed_db"
        fi
      fi
    else
      echo "# terraform output unavailable — using defaults" >&2
    fi
    popd >/dev/null
  else
    echo "# terraform CLI not found — using defaults" >&2
  fi
fi

if [[ -n "$postgres_host" && "$postgres_host" != "null" ]]; then
  cat <<EOF
# --- RDS (teamver-design terraform --from-terraform) ---
POSTGRES_HOST=${postgres_host}
POSTGRES_DB=${postgres_db}
EOF
  if [[ -n "$postgres_user" && "$postgres_user" != "null" ]]; then
    echo "POSTGRES_USER=${postgres_user}"
  fi
  echo "POSTGRES_SSLMODE=require"
  echo
fi

cat <<EOF
# --- OD project storage (09 Phase 0 — staging S3 activation) ---
OD_PROJECT_STORAGE=s3
OD_S3_BUCKET=${bucket}
OD_S3_REGION=${region}
OD_S3_PREFIX=${prefix}
OD_PROJECT_LAZY_SYNC_TTL_MS=60000
# registry delete — staging·production 동일: S3 tenant SSOT 유지 (=0)
OD_S3_PURGE_ON_DELETE=0
OD_SCRATCH_EVICT_AFTER_RUN=1
OD_SCRATCH_EVICT_IDLE=1
OD_DATA_HOST_PATH=/opt/teamver-design/od-data
OD_S3_SYNC_UP_METRICS=1
OD_SCRATCH_DISK_METRICS=1
OD_SCRATCH_DISK_THRESHOLD_MB=2048
OD_SCRATCH_DISK_METRIC_INTERVAL_MS=300000

# Litestream (hosted 필수 — deploy.sh가 항상 sidecar 시작)
# LITESTREAM_BUCKET=${bucket}
# LITESTREAM_REGION=${region}

# daemon → design-api usage M2M (FE-first 대안 경로)
# TEAMVER_INTERNAL_API_KEY=<same as design-api TEAMVER_INTERNAL_API_KEY>
EOF
