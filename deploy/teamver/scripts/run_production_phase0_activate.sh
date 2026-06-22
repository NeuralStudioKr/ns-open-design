#!/usr/bin/env bash
# Production Phase 0 — merge terraform RDS/S3 into .env.production + preflight.
#
# Does NOT run terraform apply or docker compose.
#
# Usage (production EC2, deploy/teamver):
#   bash scripts/run_production_phase0_activate.sh
#   bash scripts/run_production_phase0_activate.sh --from-terraform
#   bash scripts/run_production_phase0_activate.sh --dry-run
#
# Prerequisites:
#   teamver-design prod terraform applied (dedicated RDS + S3 + ALB)
#   cp .env.production.example .env.production (secrets: OD_API_TOKEN, JWT, POSTGRES_PASSWD, LLM keys)

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
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
  shift
done

ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE not found — cp .env.production.example .env.production first"
  exit 1
fi

echo "==> Phase 0 production activation (dedicated RDS + S3)"
echo
echo "==> Step 0: RDS"
echo "  Production uses dedicated RDS — CREATE DATABASE not required."
echo "  database teamver_design_production is created by terraform apply (db_name)."
echo

APPLY_ARGS=()
[[ "$FROM_TF" -eq 1 ]] && APPLY_ARGS+=(--from-terraform)
[[ "$DRY_RUN" -eq 1 ]] && APPLY_ARGS+=(--dry-run)

echo "==> Step 1: merge RDS + S3 env"
bash "$ROOT/scripts/apply_production_s3_env.sh" --env-file "$ENV_FILE" "${APPLY_ARGS[@]}"
echo

if [[ "$SKIP_VALIDATE" -eq 1 ]]; then
  echo "==> Step 2: validate skipped"
  exit 0
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> Step 2: validate (dry-run — skipped)"
  echo "○ dry-run complete — re-run without --dry-run to write .env.production"
  exit 0
fi

echo "==> Step 2: validate_deploy_env.sh --production --rds"
bash "$ROOT/scripts/validate_deploy_env.sh" --production --rds
echo
echo "✓ Phase 0 production env ready"
echo "   next: bash deploy.sh --production --rds"
echo "         bash scripts/print_production_track_a_e2e_env.sh --from-env .env.production"
echo "         bash scripts/run_post_deploy_track_a.sh --production --rds --smoke --e2e-strict"
