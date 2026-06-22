#!/usr/bin/env bash
# EC2 Track A post-deploy — validate → compose → sidecar deps → optional smoke/status/seed verify.
#
# Usage (on staging EC2, deploy/teamver):
#   bash scripts/run_post_deploy_track_a.sh --staging --rds
#   bash scripts/run_post_deploy_track_a.sh --staging --rds --smoke
#   bash scripts/run_post_deploy_track_a.sh --staging --rds --smoke --status-probe
#   bash scripts/run_post_deploy_track_a.sh --production --rds --smoke --e2e-strict
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
RUN_E2E=0
E2E_STRICT=0

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
    --e2e) RUN_E2E=1 ;;
    --e2e-strict) RUN_E2E=1; E2E_STRICT=1 ;;
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
  echo "==> Phase 5: smoke_design (curl, storage hard-fail default-on)"
  # loop 142 — Track A post-deploy 는 S3 reachability 가 못 잡히면 출시 게이트
  # G1 미충족이므로 즉시 stop. smoke_design 도 staging/prod 에서 default-on
  # 이지만 여기서 한 번 더 export 해 안전망을 둔다 (override: SMOKE_REQUIRE_OD_STORAGE=0).
  : "${SMOKE_REQUIRE_OD_STORAGE:=1}"
  export SMOKE_REQUIRE_OD_STORAGE
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
  echo "==> Phase 7: Main BE design-api wiring (A6 — env grep + live M2M probe)"
  # loop 142 — staging/prod 에서는 Main BE 의 TEAMVER_INTERNAL_API_KEY 로
  # design-api `/api/healthz` 와 `/api/internal/usage/events` 도달성을 직접
  # 검증. 네트워크 차단 / nginx auth gate / wrong base URL 을 잡는다.
  # Main BE EC2 에서 도달 불가하면 wiring 스크립트는 warn으로 떨어지지만,
  # design-api EC2 에서 호출되는 시나리오는 ${probe_base}/api/healthz 가 200
  # 이어야 통과한다. (--no-live 강제 비활성: NO_LIVE_WIRING=1)
  WIRING_ARGS=("$ENV_FLAG")
  if [[ "${NO_LIVE_WIRING:-0}" != "1" ]]; then
    WIRING_ARGS+=(--live)
  fi
  bash "$ROOT/scripts/check_main_be_design_wiring.sh" "${WIRING_ARGS[@]}" || true
fi

if [[ -f "$ROOT/scripts/check_storage_isolation.sh" ]]; then
  echo
  echo "==> Phase 8: storage isolation audit (S3 SSOT + RDS + Drive)"
  if ! bash "$ROOT/scripts/check_storage_isolation.sh" "$ENV_FLAG"; then
    echo "❌ storage isolation FAILED — 사용자 파일이 local-disk 에 남거나"
    echo "    deploy 재기동 시 유실될 수 있습니다. 위 출력 참고."
    exit 1
  fi
fi

if [[ "$RUN_E2E" -eq 1 ]]; then
  echo
  echo "==> Phase 9: Track A E2E (S-8 auth / U-6 usage row / D-5 publish / 격리)"
  # loop 142 — curl + RDS 기반 출시 게이트 회귀. 필수 env 가 없으면
  # graceful skip + warn 만, 모두 있으면 fail-fast.
  E2E_ARGS=("$ENV_FLAG")
  [[ "$E2E_STRICT" -eq 1 ]] && E2E_ARGS+=(--require-core)
  if ! bash "$ROOT/scripts/run_staging_track_a_e2e.sh" "${E2E_ARGS[@]}"; then
    echo "❌ Track A E2E FAILED — 출시 게이트 P0 (10 §6 / 11 §8 / 09 §14) 위반"
    exit 1
  fi
fi

echo
echo "✓ Track A post-deploy complete"
