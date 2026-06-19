#!/usr/bin/env bash
# Fixture — smoke_design.sh staging/production 시 SMOKE_REQUIRE_OD_STORAGE 가
# 자동 1로 default-on, --http 는 0 유지, override 는 그대로 전달.
#
# Usage: bash deploy/teamver/scripts/test_smoke_design_storage_default.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/smoke_design.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "❌ missing $SCRIPT"
  exit 1
fi

# 외부 hosts 로 실제 curl 안 가도록 unroutable IP 사용.
HOST_OVERRIDE='127.0.0.1:1'

run_smoke() {
  local label="$1"
  shift
  local out
  # smoke 가 curl fail 로 비-zero 종료해도 ok — 우리는 헤더/출력 일부만 검증한다.
  set +e
  out="$(DESIGN_HOST="$HOST_OVERRIDE" DESIGN_API_HOST="$HOST_OVERRIDE" \
    "$@" bash "$SCRIPT" --staging 2>&1 | head -8)"
  set -e
  echo "$out"
}

echo "==> case 1: --staging without explicit SMOKE_REQUIRE_OD_STORAGE"
out1="$(run_smoke 'staging-default')"
if ! grep -q 'SMOKE_REQUIRE_OD_STORAGE=1 (default-on for staging' <<< "$out1"; then
  echo "❌ default-on message missing for staging"
  echo "$out1"
  exit 1
fi

echo "==> case 2: override SMOKE_REQUIRE_OD_STORAGE=0 must skip default-on"
out2="$(run_smoke 'staging-override' env SMOKE_REQUIRE_OD_STORAGE=0)"
if grep -q 'SMOKE_REQUIRE_OD_STORAGE=1 (default-on' <<< "$out2"; then
  echo "❌ default-on must NOT be applied when SMOKE_REQUIRE_OD_STORAGE=0"
  echo "$out2"
  exit 1
fi

echo "==> case 3: --http (local dev) leaves default-on off"
set +e
out3="$(DESIGN_HOST="$HOST_OVERRIDE" DESIGN_API_HOST="$HOST_OVERRIDE" \
  bash "$SCRIPT" --staging --http 2>&1 | head -8)"
set -e
if grep -q 'SMOKE_REQUIRE_OD_STORAGE=1 (default-on' <<< "$out3"; then
  echo "❌ --http must clear default-on storage requirement (local dev override)"
  echo "$out3"
  exit 1
fi

echo "==> case 4: --production also turns default-on"
set +e
out4="$(DESIGN_HOST="$HOST_OVERRIDE" DESIGN_API_HOST="$HOST_OVERRIDE" \
  bash "$SCRIPT" --production 2>&1 | head -8)"
set -e
if ! grep -q 'SMOKE_REQUIRE_OD_STORAGE=1 (default-on for production' <<< "$out4"; then
  echo "❌ default-on message missing for production"
  echo "$out4"
  exit 1
fi

echo "✓ smoke_design storage default-on fixture ok"
