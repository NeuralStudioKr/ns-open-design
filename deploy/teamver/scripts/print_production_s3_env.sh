#!/usr/bin/env bash
# Print production terraform → .env.production lines (dedicated RDS + S3).
#
# Usage:
#   bash scripts/print_production_s3_env.sh
#   bash scripts/print_production_s3_env.sh --from-terraform
#
# --from-terraform: read teamver-design **prod** state (init with backend-prod.hcl first)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="${TEAMVER_DESIGN_TF_DIR:-$ROOT/../../../ns-teamver-devops/terraform/services/teamver-design}"

FROM_TF=false
while (( $# )); do
  case "$1" in
    --from-terraform) FROM_TF=true ;;
    -h|--help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
  shift
done

bucket="${OD_S3_BUCKET:-teamver-design-prod-data}"
region="${OD_S3_REGION:-ap-northeast-2}"
prefix="${OD_S3_PREFIX:-design/}"
postgres_host=""
postgres_user="teamver_design_admin"
postgres_db="${POSTGRES_DB:-teamver_design_production}"

if [[ "$FROM_TF" == true && -d "$TF_DIR" ]]; then
  if command -v terraform >/dev/null 2>&1; then
    pushd "$TF_DIR" >/dev/null
    if terraform output -json project_data_bucket >/dev/null 2>&1; then
      bucket="$(terraform output -raw project_data_bucket)"
      region="$(terraform output -raw project_data_s3_region 2>/dev/null || echo "$region")"
      prefix="$(terraform output -raw project_data_s3_prefix 2>/dev/null || echo "$prefix")"
      postgres_host="$(terraform output -raw postgres_host 2>/dev/null || true)"
      postgres_user="$(terraform output -raw postgres_username 2>/dev/null || echo "$postgres_user")"
    else
      echo "# terraform prod output unavailable — run: terraform init -backend-config=backend-prod.hcl -reconfigure" >&2
    fi
    popd >/dev/null
  else
    echo "# terraform CLI not found — using defaults" >&2
  fi
fi

if [[ -n "$postgres_host" && "$postgres_host" != "null" ]]; then
  cat <<EOF
# --- RDS (teamver-design prod terraform --from-terraform) ---
POSTGRES_HOST=${postgres_host}
POSTGRES_DB=${postgres_db}
EOF
  if [[ -n "$postgres_user" && "$postgres_user" != "null" ]]; then
    echo "POSTGRES_USER=${postgres_user}"
  fi
  echo "POSTGRES_SSLMODE=require"
  echo
else
  cat <<EOF
# --- RDS (terraform --from-terraform fills POSTGRES_HOST) ---
POSTGRES_DB=${postgres_db}
POSTGRES_USER=${postgres_user}
POSTGRES_SSLMODE=require

EOF
fi

cat <<EOF
# --- OD project storage (09 Phase 0 — production S3, required) ---
OD_PROJECT_STORAGE=s3
OD_S3_BUCKET=${bucket}
OD_S3_REGION=${region}
OD_S3_PREFIX=${prefix}
OD_PROJECT_LAZY_SYNC_TTL_MS=60000
OD_SCRATCH_DIR=/app/.od/scratch
OD_SCRATCH_EVICT_AFTER_RUN=1
OD_S3_SYNC_UP_METRICS=1
AWS_REGION=${region}

# Litestream (권장 — docker compose --profile litestream up -d)
LITESTREAM_BUCKET=${bucket}
LITESTREAM_REGION=${region}
EOF
