#!/usr/bin/env bash
# Teamver Design — staging/prod smoke (curl, no browser).
#
# Usage:
#   bash scripts/smoke_design.sh --staging
#   bash scripts/smoke_design.sh --production
#   DESIGN_HOST=stg-design.teamver.com DESIGN_API_HOST=stg-design-api.teamver.com bash scripts/smoke_design.sh
#
# Optional (authenticated checks):
#   TEAMVER_COOKIE='teamver_access_token=...' bash scripts/smoke_design.sh --staging

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DESIGN_HOST="${DESIGN_HOST:-}"
DESIGN_API_HOST="${DESIGN_API_HOST:-}"
USE_HTTPS=true

usage() {
  cat <<'EOF'
smoke_design.sh — OD daemon + design-api health & auth gate checks

  bash scripts/smoke_design.sh --staging
  bash scripts/smoke_design.sh --production

Env overrides:
  DESIGN_HOST, DESIGN_API_HOST
  TEAMVER_COOKIE (optional session cookie)
  TEAMVER_WORKSPACE_ID (optional — projects list + M2M by-model check)
  TEAMVER_INTERNAL_API_KEY (optional — internal usage + token-usage M2M)
EOF
}

while (( $# )); do
  case "$1" in
    --staging)
      DESIGN_HOST="${DESIGN_HOST:-stg-design.teamver.com}"
      DESIGN_API_HOST="${DESIGN_API_HOST:-stg-design-api.teamver.com}"
      ;;
    --production)
      DESIGN_HOST="${DESIGN_HOST:-design.teamver.com}"
      DESIGN_API_HOST="${DESIGN_API_HOST:-design-api.teamver.com}"
      ;;
    --http) USE_HTTPS=false ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ -z "$DESIGN_HOST" || -z "$DESIGN_API_HOST" ]]; then
  echo "❌ --staging 또는 --production 필요 (또는 DESIGN_HOST / DESIGN_API_HOST 설정)"
  usage
  exit 1
fi

scheme=https
if [[ "$USE_HTTPS" != true ]]; then
  scheme=http
fi

DESIGN_BASE="${scheme}://${DESIGN_HOST}"
API_BASE="${scheme}://${DESIGN_API_HOST}"

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

curl_ok() {
  local url="$1"
  curl -sf --max-time 15 "$url" >/dev/null
}

curl_status() {
  local url="$1"
  curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$url"
}

echo "==> Teamver Design smoke"
echo "    OD:         $DESIGN_BASE"
echo "    design-api: $API_BASE"
echo

check "OD daemon /api/health" curl_ok "${DESIGN_BASE}/api/health"
check "design-api /api/healthz" curl_ok "${API_BASE}/api/healthz"

session_code="$(curl_status "${API_BASE}/api/v1/auth/session")"
if [[ "$session_code" == "200" ]]; then
  echo "✓ design-api /api/v1/auth/session → 200 (unauthenticated ok)"
  pass=$((pass + 1))
else
  echo "✗ design-api /api/v1/auth/session → $session_code (expected 200)"
  fail=$((fail + 1))
fi

runtime_code="$(curl_status "${API_BASE}/api/v1/runtime-config")"
if [[ "$runtime_code" == "401" || "$runtime_code" == "403" ]]; then
  echo "✓ design-api /api/v1/runtime-config unauthenticated → $runtime_code"
  pass=$((pass + 1))
elif [[ "$runtime_code" == "200" && -n "${ALLOW_NO_JWT_LOCAL_MODE:-}" ]]; then
  echo "✓ design-api /api/v1/runtime-config → 200 (local dev mode)"
  pass=$((pass + 1))
else
  echo "✗ design-api /api/v1/runtime-config unauthenticated → $runtime_code (expected 401/403)"
  fail=$((fail + 1))
fi

bootstrap_code="$(curl_status "${API_BASE}/api/v1/bootstrap")"
if [[ "$bootstrap_code" == "401" || "$bootstrap_code" == "403" ]]; then
  echo "✓ design-api /api/v1/bootstrap unauthenticated → $bootstrap_code"
  pass=$((pass + 1))
else
  echo "✗ design-api /api/v1/bootstrap unauthenticated → $bootstrap_code (expected 401/403)"
  fail=$((fail + 1))
fi

projects_code="$(curl_status "${API_BASE}/api/v1/projects")"
if [[ "$projects_code" == "401" || "$projects_code" == "403" ]]; then
  echo "✓ design-api /api/v1/projects unauthenticated → $projects_code"
  pass=$((pass + 1))
else
  echo "✗ design-api /api/v1/projects unauthenticated → $projects_code (expected 401/403)"
  fail=$((fail + 1))
fi

publish_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"formats":["html"]}' \
  "${API_BASE}/api/v1/projects/demo-project/publish")"
if [[ "$publish_code" == "401" || "$publish_code" == "403" ]]; then
  echo "✓ design-api POST /projects/{id}/publish unauthenticated → $publish_code"
  pass=$((pass + 1))
else
  echo "✗ design-api POST /projects/{id}/publish unauthenticated → $publish_code (expected 401/403)"
  fail=$((fail + 1))
fi

if [[ -n "${TEAMVER_INTERNAL_API_KEY:-}" ]]; then
  usage_internal_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -X POST \
    -H "X-Teamver-Internal-Api-Key: ${TEAMVER_INTERNAL_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"user_id":"smoke-u","workspace_id":"smoke-w","model_name":"smoke-model","input_tokens":0,"output_tokens":0,"run_id":"smoke-run"}' \
    "${API_BASE}/api/internal/usage/events")"
  if [[ "$usage_internal_code" == "204" ]]; then
    echo "✓ design-api POST /api/internal/usage/events (M2M) → 204"
    pass=$((pass + 1))
  else
    echo "✗ design-api POST /api/internal/usage/events (M2M) → $usage_internal_code (expected 204)"
    fail=$((fail + 1))
  fi
else
  echo "○ skip internal usage M2M (set TEAMVER_INTERNAL_API_KEY to enable)"
fi

if [[ -n "${TEAMVER_INTERNAL_API_KEY:-}" && -n "${TEAMVER_WORKSPACE_ID:-}" ]]; then
  token_usage_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "X-Teamver-Internal-Api-Key: ${TEAMVER_INTERNAL_API_KEY}" \
    "${API_BASE}/api/token-usage/by-model?user_id=smoke-u&workspace_id=${TEAMVER_WORKSPACE_ID}&from=2026-06-01T00:00:00Z&to=2026-12-31T23:59:59Z")"
  if [[ "$token_usage_code" == "200" ]]; then
    echo "✓ design-api GET /api/token-usage/by-model (M2M) → 200"
    pass=$((pass + 1))
  else
    echo "✗ design-api GET /api/token-usage/by-model (M2M) → $token_usage_code (expected 200)"
    fail=$((fail + 1))
  fi
else
  echo "○ skip token-usage by-model M2M (TEAMVER_INTERNAL_API_KEY + TEAMVER_WORKSPACE_ID)"
fi

if [[ -x "$ROOT/scripts/print_staging_s3_env.sh" ]]; then
  echo "○ S3 activation template: bash scripts/print_staging_s3_env.sh [--from-terraform]"
fi

if [[ -n "${TEAMVER_COOKIE:-}" ]]; then
  authed_runtime="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    "${API_BASE}/api/v1/runtime-config")"
  if [[ "$authed_runtime" == "200" ]]; then
    echo "✓ design-api /api/v1/runtime-config (cookie) → 200"
    pass=$((pass + 1))
    configured="$(curl -sf --max-time 15 -H "Cookie: ${TEAMVER_COOKIE}" \
      "${API_BASE}/api/v1/runtime-config" | grep -c '"configured"' || true)"
    if [[ "$configured" -ge 1 ]]; then
      echo "✓ runtime-config JSON shape ok"
      pass=$((pass + 1))
    else
      echo "✗ runtime-config JSON missing configured field"
      fail=$((fail + 1))
    fi
  else
    echo "✗ design-api /api/v1/runtime-config (cookie) → $authed_runtime (expected 200)"
    fail=$((fail + 1))
  fi

  workspace_hdr=()
  if [[ -n "${TEAMVER_WORKSPACE_ID:-}" ]]; then
    workspace_hdr=(-H "X-Workspace-Id: ${TEAMVER_WORKSPACE_ID}")
  fi

  projects_list="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    "${workspace_hdr[@]}" \
    "${API_BASE}/api/v1/projects")"
  if [[ "$projects_list" == "200" ]]; then
    echo "✓ design-api /api/v1/projects (cookie) → 200"
    pass=$((pass + 1))
  elif [[ "$projects_list" == "401" || "$projects_list" == "403" ]]; then
    echo "○ design-api /api/v1/projects (cookie) → $projects_list (set TEAMVER_WORKSPACE_ID?)"
  else
    echo "✗ design-api /api/v1/projects (cookie) → $projects_list (expected 200)"
    fail=$((fail + 1))
  fi
else
  echo "○ skip authenticated runtime-config (set TEAMVER_COOKIE to enable)"
fi

if [[ -x "$ROOT/scripts/seed_od_runtime_config.sh" ]]; then
  echo "○ seed_od_runtime_config.sh present (run manually after compose up)"
fi

echo
echo "==> $pass passed, $fail failed"
if (( fail > 0 )); then
  exit 1
fi
