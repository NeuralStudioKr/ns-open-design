#!/usr/bin/env bash
# Staging Phase 0 activation — S3 env merge + preflight + post-apply checklist (09 P0 / P1-8).
#
# Does NOT run terraform apply or docker compose — prepares .env.staging and validates.
#
# Usage (staging EC2, deploy/teamver):
#   bash scripts/run_staging_phase0_activate.sh
#   bash scripts/run_staging_phase0_activate.sh --from-terraform
#   bash scripts/run_staging_phase0_activate.sh --dry-run
#
# Prerequisites:
#   cp .env.staging.example .env.staging  (secrets filled: OD_API_TOKEN, JWT, RDS, …)
#   Optional: teamver-design terraform applied → --from-terraform for bucket name

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FROM_TF=0
DRY_RUN=0
SKIP_VALIDATE=0

while (( $# )); do
  case "$1" in
    --from-terraform) FROM_TF=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --skip-validate) SKIP_VALIDATE=1 ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
  shift
done

ENV_FILE="${ENV_FILE:-$ROOT/.env.staging}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE not found — cp .env.staging.example .env.staging first"
  exit 1
fi

env_value() {
  local key="$1"
  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/^["'\'' ]+|["'\'' ]+$/, "", value)
      print value
      exit
    }
  ' "$ENV_FILE"
}

echo "==> Phase 0 staging activation (S3 + preflight)"
echo

echo "==> Step 0: staging RDS database prerequisite"
db_name="$(env_value POSTGRES_DB)"
db_user="$(env_value POSTGRES_USER)"
echo "  run once on teamver-staging RDS if database is missing:"
echo "    CREATE DATABASE ${db_name:-teamver_design_staging} OWNER ${db_user:-teamver_be_admin};"
if command -v terraform >/dev/null 2>&1 && [[ -d "$ROOT/../../ns-teamver-devops/terraform/services/teamver-design" ]]; then
  (
    cd "$ROOT/../../ns-teamver-devops/terraform/services/teamver-design"
    db_sql="$(terraform output -raw rds_create_database_sql 2>/dev/null || true)"
    if [[ -n "$db_sql" && "$db_sql" != "null" ]]; then
      echo "  terraform output rds_create_database_sql:"
      echo "    $db_sql"
    else
      echo "  ○ no shared-RDS CREATE DATABASE output (dedicated RDS or terraform not initialized)"
    fi
  )
else
  echo "  (or from ns-teamver-devops: terraform output -raw rds_create_database_sql)"
fi
echo

APPLY_ARGS=()
if [[ "$FROM_TF" -eq 1 ]]; then
  APPLY_ARGS+=(--from-terraform)
fi
if [[ "$DRY_RUN" -eq 1 ]]; then
  APPLY_ARGS+=(--dry-run)
fi

echo "==> Step 1: merge S3 env into .env.staging"
bash "$ROOT/scripts/apply_staging_s3_env.sh" --env-file "$ENV_FILE" "${APPLY_ARGS[@]}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo
  echo "○ dry-run complete — re-run without --dry-run to write .env.staging"
  exit 0
fi

if [[ "$SKIP_VALIDATE" -eq 0 ]]; then
  echo
  echo "==> Step 2: validate_deploy_env (--staging --rds)"
  bash "$ROOT/scripts/validate_deploy_env.sh" --staging --rds
else
  echo "○ skip validate (--skip-validate)"
fi

echo
echo "==> Step 3: Main BE design-api wiring (read-only)"
if bash "$ROOT/scripts/check_main_be_design_wiring.sh" --staging 2>/dev/null; then
  :
else
  echo "○ Main BE env fix — merge snippet:"
  bash "$ROOT/scripts/print_main_be_design_env.sh" --staging | sed 's/^/    /'
fi

echo
echo "==> Next steps (manual on EC2)"
cat <<'EOF'
  1. Restart sidecar with S3 mode:
       bash scripts/run_docker.sh --staging --rds
  2. Optional Litestream (app.sqlite → S3):
       docker compose --profile litestream up -d
  3. Loopback deps:
       bash scripts/check_sidecar_deps.sh --staging
  4. Full post-deploy:
       bash scripts/run_post_deploy_track_a.sh --staging --rds --smoke
  5. CloudWatch alarms (print or --apply):
       bash scripts/print_cloudwatch_alarm_commands.sh --staging
  6. Main BE ai_app row (A8):
       MAIN_BE_DATABASE_URL='…' bash scripts/seed_main_be_design_app.sh --staging --verify-only
EOF

echo
echo "✓ Phase 0 staging activation prep complete"
