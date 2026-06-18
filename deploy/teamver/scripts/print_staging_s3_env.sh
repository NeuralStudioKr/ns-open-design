#!/usr/bin/env bash
# Print staging S3 env lines for deploy/teamver/.env.staging (09 Phase 0 activation).
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

if [[ "$FROM_TF" == true && -d "$TF_DIR" ]]; then
  if command -v terraform >/dev/null 2>&1; then
    pushd "$TF_DIR" >/dev/null
    if terraform output -json project_data_bucket >/dev/null 2>&1; then
      bucket="$(terraform output -raw project_data_bucket)"
      region="$(terraform output -raw project_data_s3_region 2>/dev/null || echo "$region")"
      prefix="$(terraform output -raw project_data_s3_prefix 2>/dev/null || echo "$prefix")"
    else
      echo "# terraform output unavailable — using defaults" >&2
    fi
    popd >/dev/null
  else
    echo "# terraform CLI not found — using defaults" >&2
  fi
fi

cat <<EOF
# --- OD project storage (09 Phase 0 — staging S3 activation) ---
OD_PROJECT_STORAGE=s3
OD_S3_BUCKET=${bucket}
OD_S3_REGION=${region}
OD_S3_PREFIX=${prefix}
OD_PROJECT_LAZY_SYNC_TTL_MS=60000
# registry delete 시 tenant S3 prefix purge (기본 on — 비활성: OD_S3_PURGE_ON_DELETE=0)
# OD_S3_PURGE_ON_DELETE=0
# OD_S3_SYNC_UP_METRICS=1

# Litestream (optional — docker compose --profile litestream up -d)
# LITESTREAM_BUCKET=${bucket}
# LITESTREAM_REGION=${region}

# daemon → design-api usage M2M (FE-first 대안 경로)
# TEAMVER_INTERNAL_API_KEY=<same as design-api TEAMVER_INTERNAL_API_KEY>
EOF
