#!/usr/bin/env bash
# EC2 Track A post-deploy — validate → compose → sidecar deps → optional smoke/status/seed verify.
#
# Usage (on staging EC2, deploy/teamver):
#   bash scripts/run_post_deploy_track_a.sh --staging --rds
#   bash scripts/run_post_deploy_track_a.sh --staging --rds --smoke
#   bash scripts/run_post_deploy_track_a.sh --staging --rds --smoke --status-probe
#   MAIN_BE_DATABASE_URL='postgresql://…' \
#     bash scripts/run_post_deploy_track_a.sh --staging --rds --seed-verify
#
# Skips compose when --deps-only (sidecar + smoke after manual compose).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FLAG=""
USE_RDS=false
RUN_SMOKE=0
STATUS_PROBE=0
DEPS_ONLY=0
WITH_MINIO=0
SEED_VERIFY=0

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
}

while (( $# )); do
  case "$1" in
    --staging) ENV_FLAG=--staging ;;
    --production) ENV_FLAG=--production ;;
    --rds) USE_RDS=true ;;
    --with-minio) WITH_MINIO=1 ;;
    --smoke) RUN_SMOKE=1 ;;
    --status-probe) STATUS_PROBE=1 ;;
    --deps-only) DEPS_ONLY=1 ;;
    --seed-verify) SEED_VERIFY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ -z "$ENV_FLAG" ]]; then
  echo "❌ --staging 또는 --production 필요"
  usage
  exit 1
fi

DOCKER_ARGS=("$ENV_FLAG")
VALIDATE_ARGS=("$ENV_FLAG")
STATUS_ARGS=("$ENV_FLAG")
SMOKE_ARGS=("$ENV_FLAG")
DEPS_ARGS=("$ENV_FLAG")

if [[ "$USE_RDS" == true ]]; then
  DOCKER_ARGS+=(--rds)
  VALIDATE_ARGS+=(--rds)
fi
if [[ "$WITH_MINIO" -eq 1 ]]; then
  DOCKER_ARGS+=(--with-minio)
fi

echo "==> Phase 1: validate_deploy_env"
bash "$ROOT/scripts/validate_deploy_env.sh" "${VALIDATE_ARGS[@]}"

if [[ "$DEPS_ONLY" -eq 0 ]]; then
  echo
  echo "==> Phase 2: run_docker (compose up)"
  bash "$ROOT/scripts/run_docker.sh" "${DOCKER_ARGS[@]}"
else
  echo
  echo "○ skip compose (--deps-only)"
fi

echo
echo "==> Phase 3: check_sidecar_deps (loopback)"
if ! bash "$ROOT/scripts/check_sidecar_deps.sh" "${DEPS_ARGS[@]}"; then
  echo "❌ sidecar deps failed"
  exit 1
fi

if [[ "$STATUS_PROBE" -eq 1 ]]; then
  echo
  echo "==> Phase 4: print_track_a_status --probe"
  bash "$ROOT/scripts/print_track_a_status.sh" "${STATUS_ARGS[@]}" --probe || true
fi

if [[ "$RUN_SMOKE" -eq 1 ]]; then
  echo
  echo "==> Phase 5: smoke_design (curl)"
  bash "$ROOT/scripts/smoke_design.sh" "${SMOKE_ARGS[@]}"
fi

if [[ "$SEED_VERIFY" -eq 1 ]]; then
  echo
  echo "==> Phase 6: Main BE ai_app seed verify (A8)"
  if [[ -z "${MAIN_BE_DATABASE_URL:-}" ]]; then
    echo "❌ MAIN_BE_DATABASE_URL required for --seed-verify"
    exit 1
  fi
  bash "$ROOT/scripts/seed_main_be_design_app.sh" "$ENV_FLAG" --verify-only
fi

if [[ -f "$ROOT/scripts/check_main_be_design_wiring.sh" ]]; then
  echo
  echo "==> Phase 7: Main BE design-api wiring (A6 — read-only env check)"
  bash "$ROOT/scripts/check_main_be_design_wiring.sh" "$ENV_FLAG" || true
fi

echo
echo "✓ Track A post-deploy complete"
