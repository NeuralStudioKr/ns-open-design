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

# Docker-published ports (127.0.0.1:7456 → container) see the host gateway as
# remoteAddress, not loopback — OD_API_TOKEN Bearer is required for /api probes.
daemon_curl_auth=()
if [[ -n "${OD_API_TOKEN:-}" ]]; then
  daemon_curl_auth=(-H "Authorization: Bearer ${OD_API_TOKEN}")
fi

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
  main_be="$(echo "$deps_json" | sed -n 's/.*"main_be":"\([^"]*\)".*/\1/p' | head -1)"
  if [[ -n "$main_be" ]]; then
    if [[ "$main_be" == "ok" ]]; then
      echo "✓ deps main_be=$main_be"
      pass=$((pass + 1))
    else
      echo "✗ deps main_be=$main_be (Drive browse BFF·bootstrap·session-check 실패 가능 — Main BE 복구 필요)"
      fail=$((fail + 1))
    fi
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
  "${daemon_curl_auth[@]}" \
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

evict_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
  -X POST \
  "${daemon_curl_auth[@]}" \
  "http://127.0.0.1:${OD_PORT}/api/projects/_sidecar_probe_/scratch/evict" 2>/dev/null || echo "000")"
if [[ "$evict_code" == "401" ]]; then
  echo "✓ OD daemon scratch/evict → 401 (teamver access gate — registry delete purge path)"
  pass=$((pass + 1))
elif [[ "$evict_code" == "204" ]]; then
  echo "○ OD daemon scratch/evict → 204 (TEAMVER_DESIGN_API_URL unset — local mode)"
elif [[ "$evict_code" == "404" ]]; then
  echo "✗ OD daemon scratch/evict → 404 (route missing — redeploy daemon)"
  fail=$((fail + 1))
else
  echo "○ OD daemon scratch/evict → $evict_code"
fi

if [[ -n "${TEAMVER_DESIGN_API_URL:-}" ]]; then
  if [[ -z "${OD_API_TOKEN:-}" ]]; then
    echo "✗ OD daemon embed gates need OD_API_TOKEN (Docker loopback is not peer-loopback)"
    fail=$((fail + 2))
  else
  import_body="$(mktemp)"
  import_code="$(curl -s -o "$import_body" -w '%{http_code}' --max-time 8 \
    -X POST \
    "${daemon_curl_auth[@]}" \
    -H 'Content-Type: application/json' \
    -d '{"baseDir":"/tmp","name":"probe"}' \
    "http://127.0.0.1:${OD_PORT}/api/import/folder" 2>/dev/null || echo "000")"
  if [[ "$import_code" == "400" ]] && grep -q 'FOLDER_IMPORT_UNAVAILABLE' "$import_body" 2>/dev/null; then
    echo "✓ OD daemon /api/import/folder → 400 FOLDER_IMPORT_UNAVAILABLE (embed gate)"
    pass=$((pass + 1))
  else
    echo "✗ OD daemon folder import gate — http=$import_code body=$(tr -d '\n' < "$import_body" | head -c 200)"
    fail=$((fail + 1))
  fi

  linked_body="$(mktemp)"
  linked_code="$(curl -s -o "$linked_body" -w '%{http_code}' --max-time 8 \
    -X POST \
    "${daemon_curl_auth[@]}" \
    -H 'Content-Type: application/json' \
    -d '{"id":"_sidecar_linked_dirs_probe_","name":"probe","metadata":{"kind":"prototype","linkedDirs":["/tmp"]}}' \
    "http://127.0.0.1:${OD_PORT}/api/projects" 2>/dev/null || echo "000")"
  if [[ "$linked_code" == "400" ]] && grep -q 'LINKED_DIRS_UNAVAILABLE' "$linked_body" 2>/dev/null; then
    echo "✓ OD daemon POST /api/projects linkedDirs → 400 LINKED_DIRS_UNAVAILABLE"
    pass=$((pass + 1))
  else
    echo "✗ OD daemon linkedDirs gate — http=$linked_code body=$(tr -d '\n' < "$linked_body" | head -c 200)"
    fail=$((fail + 1))
  fi
  rm -f "$import_body" "$linked_body"
  fi
else
  echo "○ skip embed local-folder gates (TEAMVER_DESIGN_API_URL unset)"
fi

# design-api internal billing endpoints reachable from daemon loopback (M2M).
billing_unauth_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
  -X POST \
  -H 'Content-Type: application/json' \
  -d '{"workspace_id":"sidecar-probe","amount":0}' \
  "http://127.0.0.1:${BE_PORT}/api/internal/billing/reserve" 2>/dev/null || echo "000")"
if [[ "$billing_unauth_code" == "401" || "$billing_unauth_code" == "403" ]]; then
  echo "✓ design-api /api/internal/billing/reserve unauthenticated → $billing_unauth_code"
  pass=$((pass + 1))
elif [[ "$billing_unauth_code" == "404" ]]; then
  echo "✗ design-api /api/internal/billing/reserve → 404 (endpoint missing — redeploy design-api)"
  fail=$((fail + 1))
else
  echo "○ design-api /api/internal/billing/reserve unauthenticated → $billing_unauth_code"
fi

if [[ -n "${TEAMVER_INTERNAL_API_KEY:-}" ]]; then
  billing_auth_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
    -X POST \
    -H "X-Teamver-Internal-Api-Key: ${TEAMVER_INTERNAL_API_KEY}" \
    -H 'Content-Type: application/json' \
    -d '{"workspace_id":"sidecar-probe","amount":0,"reason":"sidecar"}' \
    "http://127.0.0.1:${BE_PORT}/api/internal/billing/reserve" 2>/dev/null || echo "000")"
  if [[ "$billing_auth_code" == "200" ]]; then
    echo "✓ design-api /api/internal/billing/reserve (M2M) → 200"
    pass=$((pass + 1))
  else
    echo "✗ design-api /api/internal/billing/reserve (M2M) → $billing_auth_code (expected 200)"
    fail=$((fail + 1))
  fi
fi

echo
echo "==> $pass passed, $fail failed"
if (( fail > 0 )); then
  exit 1
fi
