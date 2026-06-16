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
    --staging|--production)
      if [[ -f ".env${1#--}" ]]; then
        # shellcheck disable=SC1090
        set -a
        source ".env${1#--}"
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

deps_json="$(curl -sf --max-time 8 "http://127.0.0.1:${BE_PORT}/api/healthz/deps" 2>/dev/null || echo "")"
if [[ -n "$deps_json" ]]; then
  echo "✓ design-api /api/healthz/deps"
  pass=$((pass + 1))
  echo "    $deps_json"
  if echo "$deps_json" | grep -q '"daemon":"unavailable"'; then
    echo "✗ daemon dependency unavailable"
    fail=$((fail + 1))
  fi
else
  echo "✗ design-api /api/healthz/deps"
  fail=$((fail + 1))
fi

check "OD daemon /api/health" curl -sf --max-time 5 "http://127.0.0.1:${OD_PORT}/api/health" >/dev/null

echo
echo "==> $pass passed, $fail failed"
if (( fail > 0 )); then
  exit 1
fi
