#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/print_production_track_a_e2e_env.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/.env.production" <<'EOF'
POSTGRES_HOST=prod-db.internal
POSTGRES_PORT=5433
POSTGRES_DB=teamver_prod
POSTGRES_USER=prod_admin
TEAMVER_INTERNAL_API_KEY=prod-m2m
OD_S3_BUCKET=prod-design-bucket
EOF

out="$(bash "$SCRIPT" --from-env "$WORK/.env.production")"
for needle in \
  'prod_admin:<password>@prod-db.internal:5433/teamver_prod?sslmode=require' \
  "TEAMVER_INTERNAL_API_KEY='<from .env.production TEAMVER_INTERNAL_API_KEY>'" \
  "TEAMVER_S3_BUCKET='prod-design-bucket'" \
  'run_post_deploy_track_a.sh --production --rds --smoke --e2e-strict'
do
  grep -qF "$needle" <<< "$out" || { echo "❌ missing: $needle"; exit 1; }
done

if grep -q 'prod-m2m' <<< "$out"; then
  echo "❌ production helper must not print M2M secret"
  exit 1
fi

if bash "$SCRIPT" --from-env "$WORK/missing" >/dev/null 2>&1; then
  echo "❌ missing env file must fail"
  exit 1
fi

echo "✓ production Track A env helper fixture ok"
