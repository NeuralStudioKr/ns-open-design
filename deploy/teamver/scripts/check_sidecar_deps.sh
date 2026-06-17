#!/usr/bin/env bash
# Loopback dependency check for Teamver Design sidecar (EC2 host).
#
# Usage:
#   bash scripts/check_sidecar_deps.sh
#   bash scripts/check_sidecar_deps.sh --staging

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BE_PORT="${BE_PORT:-16000}"
OD_PORT="${OD_PORT:-7456}"

while (( $# )); do
  case "$1" in
    --staging)
      if [[ -f ".env.staging" ]]; then
        # shellcheck disable=SC1090
        set -a
        source ".env.staging"
        set +a
        BE_PORT="${BE_PORT:-16000}"
        OD_PORT="${OD_PORT:-7456}"
      fi
      ;;
    --production)
      if [[ -f ".env.production" ]]; then
        # shellcheck disable=SC1090
        set -a
        source ".env.production"
        set +a
        BE_PORT="${BE_PORT:-16000}"
        OD_PORT="${OD_PORT:-7456}"
      fi
      ;;
    -h|--help)
      sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
  shift
done

pass=0
fail=0

check() {
  local name="$1"
  shift
  if "$@"; then
    echo "✓ $name"
    pass=$((pass + 1))
  else
    echo "✗ $name"
    fail=$((fail + 1))
  fi
}

echo "==> Teamver Design sidecar deps (loopback)"
echo "    design-api: http://127.0.0.1:${BE_PORT}"
echo "    daemon:     http://127.0.0.1:${OD_PORT}"
echo

check "design-api /api/healthz" curl -sf --max-time 5 "http://127.0.0.1:${BE_PORT}/api/healthz" >/dev/null

healthz_json="$(curl -sf --max-time 5 "http://127.0.0.1:${BE_PORT}/api/healthz" 2>/dev/null || echo "")"
if [[ -n "$healthz_json" ]]; then
  if echo "$healthz_json" | grep -q '"design_projects":"ok"' \
    && echo "$healthz_json" | grep -q '"design_outputs":"ok"'; then
    echo "✓ design-api /api/healthz schema tables (design_projects, design_outputs)"
    pass=$((pass + 1))
  else
    echo "✗ design-api /api/healthz missing registry tables — $healthz_json"
    fail=$((fail + 1))
  fi
else
  echo "✗ design-api /api/healthz json"
  fail=$((fail + 1))
fi

deps_json="$(curl -sf --max-time 8 "http://127.0.0.1:${BE_PORT}/api/healthz/deps" 2>/dev/null || echo "")"
if [[ -n "$deps_json" ]]; then
  echo "✓ design-api /api/healthz/deps"
  pass=$((pass + 1))
  echo "    $deps_json"
  if echo "$deps_json" | grep -q '"daemon":"unavailable"'; then
    echo "✗ daemon dependency unavailable"
    fail=$((fail + 1))
  fi
  if echo "$deps_json" | grep -q '"managed_api":"missing"'; then
    echo "○ config.managed_api missing (embed BYOK only unless TEAMVER_OD_API_KEY set)"
  fi
  storage="$(echo "$deps_json" | sed -n 's/.*"project_storage":"\([^"]*\)".*/\1/p' | head -1)"
  expected="${OD_PROJECT_STORAGE:-local}"
  expected="$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]')"
  if [[ -n "$storage" ]]; then
    if [[ "$storage" == "$expected" ]]; then
      echo "✓ config.project_storage=$storage"
      pass=$((pass + 1))
    else
      echo "✗ config.project_storage=$storage (expected $expected from OD_PROJECT_STORAGE)"
      fail=$((fail + 1))
    fi
  else
    echo "○ config.project_storage not reported in deps"
  fi
else
  echo "✗ design-api /api/healthz/deps"
  fail=$((fail + 1))
fi

check "OD daemon /api/health" curl -sf --max-time 5 "http://127.0.0.1:${OD_PORT}/api/health" >/dev/null

scratch_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
  -X POST \
  "http://127.0.0.1:${OD_PORT}/api/projects/_sidecar_probe_/scratch/sync-up" 2>/dev/null || echo "000")"
if [[ "$scratch_code" == "401" ]]; then
  echo "✓ OD daemon scratch/sync-up → 401 (teamver access gate)"
  pass=$((pass + 1))
elif [[ "$scratch_code" == "204" ]]; then
  echo "○ OD daemon scratch/sync-up → 204 (TEAMVER_DESIGN_API_URL unset — local mode)"
elif [[ "$scratch_code" == "404" ]]; then
  echo "✗ OD daemon scratch/sync-up → 404 (route missing — redeploy daemon)"
  fail=$((fail + 1))
else
  echo "○ OD daemon scratch/sync-up → $scratch_code"
fi

echo
echo "==> $pass passed, $fail failed"
if (( fail > 0 )); then
  exit 1
fi
