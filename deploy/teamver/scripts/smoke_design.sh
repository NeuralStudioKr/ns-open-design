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
  DESIGN_DAEMON_LOCAL_URL (optional — direct daemon probe on VM, e.g. http://127.0.0.1:7456)
  DESIGN_API_LOCAL_URL (optional — loopback M2M when nginx blocks /api/internal/ publicly)
  TEAMVER_COOKIE (optional session cookie)
  TEAMVER_WORKSPACE_ID (optional — projects list + M2M by-model check)
  TEAMVER_OD_PROJECT_ID (optional — /projects/{id}/access + S3 prefix header)
  TEAMVER_INTERNAL_API_KEY (optional — internal usage + token-usage M2M)
  OD_PROJECT_STORAGE (optional — deps config.project_storage 일치 검증)
  SMOKE_REQUIRE_OD_STORAGE (optional — checks.od_storage!=ok 이면 fail; OD_PROJECT_STORAGE=s3 일 때도 동일)
  SMOKE_REQUIRE_MANAGED_API (optional — staging cookie runtime-config configured=false 이면 fail; default 1)
EOF
}

AUTO_REQUIRE_STORAGE=0
ENV_LABEL=""

while (( $# )); do
  case "$1" in
    --staging)
      DESIGN_HOST="${DESIGN_HOST:-stg-design.teamver.com}"
      DESIGN_API_HOST="${DESIGN_API_HOST:-stg-design-api.teamver.com}"
      AUTO_REQUIRE_STORAGE=1
      ENV_LABEL=staging
      ;;
    --production)
      DESIGN_HOST="${DESIGN_HOST:-design.teamver.com}"
      DESIGN_API_HOST="${DESIGN_API_HOST:-design-api.teamver.com}"
      AUTO_REQUIRE_STORAGE=1
      ENV_LABEL=production
      ;;
    --http)
      USE_HTTPS=false
      # local dev override — keep SMOKE_REQUIRE_OD_STORAGE opt-in
      AUTO_REQUIRE_STORAGE=0
      ;;
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

# loop 142 — staging/production smoke 는 OD storage reachability 를 기본 hard-fail
# 로 한다 (09 Phase 0/G1 출시 게이트). curl smoke 가 "auth gate 만 통과" 해도
# S3 가 unreachable 이면 사용자 파일 SSOT 가 깨진다. override: SMOKE_REQUIRE_OD_STORAGE=0.
if [[ "$AUTO_REQUIRE_STORAGE" -eq 1 && -z "${SMOKE_REQUIRE_OD_STORAGE:-}" ]]; then
  SMOKE_REQUIRE_OD_STORAGE=1
  export SMOKE_REQUIRE_OD_STORAGE
  echo "    SMOKE_REQUIRE_OD_STORAGE=1 (default-on for ${ENV_LABEL}; override: SMOKE_REQUIRE_OD_STORAGE=0)"
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
  if curl -sf --max-time 15 "$url" >/dev/null 2>&1; then
    return 0
  fi
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$url" 2>/dev/null || echo "000")"
  if [[ "$code" == "000" ]]; then
    echo "    (connection failed — check VPN/DNS or staging EC2 is up)" >&2
  fi
  return 1
}

curl_status() {
  local url="$1"
  curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$url"
}

# Public design-api host uses nginx auth_request + login redirect (302) for browsers.
is_public_auth_gate_code() {
  local code="$1"
  [[ "$code" == "401" || "$code" == "403" || "$code" == "302" ]]
}

echo "==> Teamver Design smoke"
echo "    OD:         $DESIGN_BASE"
echo "    design-api: $API_BASE"
echo

check "OD daemon /api/health" curl_ok "${DESIGN_BASE}/api/health"
check "design-api /api/healthz" curl_ok "${API_BASE}/api/healthz"

deps_probe_code="$(curl_status "${API_BASE}/api/healthz/deps")"
if [[ "$deps_probe_code" == "200" ]]; then
  echo "✓ design-api /api/healthz/deps"
  pass=$((pass + 1))
elif [[ "$deps_probe_code" == "404" ]]; then
  echo "○ design-api /api/healthz/deps → 404 (redeploy design-api + nginx location)"
else
  echo "✗ design-api /api/healthz/deps → $deps_probe_code (expected 200)"
  fail=$((fail + 1))
fi

scratch_sync_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -X POST \
  "${DESIGN_BASE}/api/projects/_smoke_probe_/scratch/sync-up" 2>/dev/null || echo "000")"
if [[ "$scratch_sync_code" == "401" ]]; then
  echo "✓ OD daemon POST …/scratch/sync-up → 401 (teamver access gate)"
  pass=$((pass + 1))
elif [[ "$scratch_sync_code" == "302" ]]; then
  echo "✓ OD daemon scratch/sync-up → 302 (nginx login redirect)"
  pass=$((pass + 1))
elif [[ "$scratch_sync_code" == "204" ]]; then
  echo "○ OD daemon scratch/sync-up → 204 (TEAMVER_DESIGN_API_URL unset on daemon — local mode)"
elif [[ "$scratch_sync_code" == "404" ]]; then
  echo "✗ OD daemon scratch/sync-up → 404 (route missing — redeploy daemon image)"
  fail=$((fail + 1))
else
  echo "○ OD daemon scratch/sync-up → $scratch_sync_code"
fi

healthz_json="$(curl -sf --max-time 15 "${API_BASE}/api/healthz" 2>/dev/null || echo "")"
if [[ -n "$healthz_json" ]] \
  && echo "$healthz_json" | grep -q '"design_projects":"ok"' \
  && echo "$healthz_json" | grep -q '"design_outputs":"ok"'; then
  echo "✓ design-api /api/healthz registry tables ok"
  pass=$((pass + 1))
elif [[ -n "$healthz_json" ]]; then
  echo "○ design-api /api/healthz registry tables — $healthz_json"
else
  echo "○ skip healthz table probe (unreachable)"
fi

deps_json="$(curl -sf --max-time 15 "${API_BASE}/api/healthz/deps" 2>/dev/null || echo "")"
deps_project_storage=""
if [[ -n "$deps_json" ]]; then
  deps_project_storage="$(echo "$deps_json" | sed -n 's/.*"project_storage":"\([^"]*\)".*/\1/p' | head -1)"
fi

if [[ -n "$deps_json" ]] && [[ -n "${OD_PROJECT_STORAGE:-}" ]]; then
  expected="$(printf '%s' "$OD_PROJECT_STORAGE" | tr '[:upper:]' '[:lower:]')"
  if [[ -n "$deps_project_storage" && "$deps_project_storage" == "$expected" ]]; then
    echo "✓ design-api deps config.project_storage=$deps_project_storage"
    pass=$((pass + 1))
  elif [[ -n "$deps_project_storage" ]]; then
    echo "✗ design-api deps project_storage=$deps_project_storage (expected $expected)"
    fail=$((fail + 1))
  fi
elif [[ -n "$deps_project_storage" ]]; then
  echo "✓ design-api deps config.project_storage=$deps_project_storage"
  pass=$((pass + 1))
fi

# Registry creds presence — healthz/deps surfaces "configured"/"missing".
# We don't fail when registry is missing (single-tenant safe), but we DO
# fail when prod-y env signals creds were intended (env override flag).
if [[ -n "$deps_json" ]]; then
  registry_status="$(echo "$deps_json" | sed -n 's/.*"registry_creds":"\([^"]*\)".*/\1/p' | head -1)"
  if [[ -n "$registry_status" ]]; then
    if [[ "${SMOKE_REQUIRE_REGISTRY_CREDS:-0}" == "1" && "$registry_status" != "configured" ]]; then
      echo "✗ design-api deps config.registry_creds=$registry_status (expected configured)"
      fail=$((fail + 1))
    else
      echo "✓ design-api deps config.registry_creds=$registry_status"
      pass=$((pass + 1))
    fi
  fi
fi

# OD storage reachability — design-api brokers daemon's /api/health/storage.
# Treat "ok" as pass, "not_configured" as info (local-mode daemon),
# everything else as fail when storage is expected to be reachable.
if [[ -n "$deps_json" ]]; then
  od_storage_status="$(echo "$deps_json" | sed -n 's/.*"od_storage":"\([^"]*\)".*/\1/p' | head -1)"
  if [[ -n "$od_storage_status" ]]; then
    case "$od_storage_status" in
      ok)
        echo "✓ design-api deps checks.od_storage=ok"
        pass=$((pass + 1))
        ;;
      not_configured)
        echo "○ design-api deps checks.od_storage=not_configured (daemon URL unset on BFF)"
        ;;
      degraded|unavailable)
        require_storage=false
        if [[ "${SMOKE_REQUIRE_OD_STORAGE:-0}" == "1" ]]; then
          require_storage=true
        elif [[ "$(printf '%s' "${deps_project_storage:-}" | tr '[:upper:]' '[:lower:]')" == "s3" ]]; then
          require_storage=true
        elif [[ -n "${OD_PROJECT_STORAGE:-}" ]] && [[ "$(printf '%s' "$OD_PROJECT_STORAGE" | tr '[:upper:]' '[:lower:]')" == "s3" ]]; then
          require_storage=true
        fi
        if [[ "$require_storage" == true ]]; then
          echo "✗ design-api deps checks.od_storage=$od_storage_status (S3 reachability required — probe daemon /api/health/storage)"
          fail=$((fail + 1))
        else
          echo "○ design-api deps checks.od_storage=$od_storage_status (set OD_PROJECT_STORAGE=s3 or SMOKE_REQUIRE_OD_STORAGE=1 to enforce)"
        fi
        ;;
      *)
        echo "○ design-api deps checks.od_storage=$od_storage_status"
        ;;
    esac
  fi
fi

# Daemon-direct storage probe — also surfaces local-mode (no S3) cleanly.
# Public DESIGN_BASE may be protected by nginx auth_request and return 302;
# on the VM set DESIGN_DAEMON_LOCAL_URL=http://127.0.0.1:7456 for a true
# direct daemon probe.
STORAGE_PROBE_BASE="${DESIGN_DAEMON_LOCAL_URL:-$DESIGN_BASE}"
storage_probe_headers=()
if [[ -n "${DESIGN_DAEMON_LOCAL_URL:-}" && -n "${OD_API_TOKEN:-}" ]]; then
  storage_probe_headers=(-H "Authorization: Bearer ${OD_API_TOKEN}")
fi
storage_probe_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${storage_probe_headers[@]}" "${STORAGE_PROBE_BASE}/api/health/storage")"
if [[ "$storage_probe_code" == "200" || "$storage_probe_code" == "503" || "$storage_probe_code" == "504" ]]; then
  storage_probe_json="$(curl -s --max-time 8 "${storage_probe_headers[@]}" "${STORAGE_PROBE_BASE}/api/health/storage" 2>/dev/null || echo "")"
  storage_mode="$(echo "$storage_probe_json" | sed -n 's/.*"mode":"\([^"]*\)".*/\1/p' | head -1)"
  storage_ok="$(echo "$storage_probe_json" | sed -n 's/.*"ok":\(true\|false\).*/\1/p' | head -1)"
  if [[ "$storage_ok" == "true" ]]; then
    echo "✓ OD daemon /api/health/storage → 200 ok mode=${storage_mode:-?}"
    pass=$((pass + 1))
  elif [[ "$storage_ok" == "false" ]]; then
    storage_reason="$(echo "$storage_probe_json" | sed -n 's/.*"reason":"\([^"]*\)".*/\1/p' | head -1)"
    echo "✗ OD daemon /api/health/storage ok=false mode=${storage_mode:-?} reason=${storage_reason:-?}"
    fail=$((fail + 1))
  else
    echo "○ OD daemon /api/health/storage → $storage_probe_code (no JSON body)"
  fi
elif [[ "$storage_probe_code" == "404" ]]; then
  echo "○ OD daemon /api/health/storage → 404 (redeploy daemon for storage probe)"
elif [[ "$storage_probe_code" == "302" && -z "${DESIGN_DAEMON_LOCAL_URL:-}" ]]; then
  echo "○ OD daemon /api/health/storage → 302 (nginx login redirect; set DESIGN_DAEMON_LOCAL_URL=http://127.0.0.1:7456 on VM for direct probe)"
else
  echo "✗ OD daemon /api/health/storage → $storage_probe_code"
  fail=$((fail + 1))
fi

session_code="$(curl_status "${API_BASE}/api/v1/auth/session")"
if [[ "$session_code" == "200" ]]; then
  echo "✓ design-api /api/v1/auth/session → 200 (unauthenticated ok)"
  pass=$((pass + 1))
else
  echo "✗ design-api /api/v1/auth/session → $session_code (expected 200)"
  fail=$((fail + 1))
fi

refresh_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -X POST \
  -H "Accept: application/json" \
  "${API_BASE}/api/v1/auth/refresh")"
if [[ "$refresh_code" == "502" ]]; then
  echo "✗ design-api POST /api/v1/auth/refresh → 502 (Main BE unreachable)"
  fail=$((fail + 1))
elif [[ "$refresh_code" == "404" ]]; then
  echo "✗ design-api POST /api/v1/auth/refresh → 404 (route missing)"
  fail=$((fail + 1))
else
  echo "✓ design-api POST /api/v1/auth/refresh → $refresh_code (proxy reachable)"
  pass=$((pass + 1))
fi

if [[ -n "${TEAMVER_COOKIE:-}" ]]; then
  refresh_authed="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -X POST \
    -H "Accept: application/json" \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    "${API_BASE}/api/v1/auth/refresh")"
  if [[ "$refresh_authed" == "200" || "$refresh_authed" == "401" ]]; then
    echo "✓ design-api POST /api/v1/auth/refresh (cookie) → $refresh_authed"
    pass=$((pass + 1))
  else
    echo "✗ design-api POST /api/v1/auth/refresh (cookie) → $refresh_authed (expected 200/401)"
    fail=$((fail + 1))
  fi
fi

runtime_code="$(curl_status "${API_BASE}/api/v1/runtime-config")"
if is_public_auth_gate_code "$runtime_code"; then
  echo "✓ design-api /api/v1/runtime-config unauthenticated → $runtime_code (auth gate)"
  pass=$((pass + 1))
elif [[ "$runtime_code" == "200" && -n "${ALLOW_NO_JWT_LOCAL_MODE:-}" ]]; then
  echo "✓ design-api /api/v1/runtime-config → 200 (local dev mode)"
  pass=$((pass + 1))
else
  echo "✗ design-api /api/v1/runtime-config unauthenticated → $runtime_code (expected 401/403/302)"
  fail=$((fail + 1))
fi

bootstrap_code="$(curl_status "${API_BASE}/api/v1/bootstrap")"
if is_public_auth_gate_code "$bootstrap_code"; then
  echo "✓ design-api /api/v1/bootstrap unauthenticated → $bootstrap_code (auth gate)"
  pass=$((pass + 1))
else
  echo "✗ design-api /api/v1/bootstrap unauthenticated → $bootstrap_code (expected 401/403/302)"
  fail=$((fail + 1))
fi

projects_code="$(curl_status "${API_BASE}/api/v1/projects")"
if is_public_auth_gate_code "$projects_code"; then
  echo "✓ design-api /api/v1/projects unauthenticated → $projects_code (auth gate)"
  pass=$((pass + 1))
else
  echo "✗ design-api /api/v1/projects unauthenticated → $projects_code (expected 401/403/302)"
  fail=$((fail + 1))
fi

publish_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"formats":["html"]}' \
  "${API_BASE}/api/v1/projects/demo-project/publish")"
if is_public_auth_gate_code "$publish_code"; then
  echo "✓ design-api POST /projects/{id}/publish unauthenticated → $publish_code (auth gate)"
  pass=$((pass + 1))
else
  echo "✗ design-api POST /projects/{id}/publish unauthenticated → $publish_code (expected 401/403/302)"
  fail=$((fail + 1))
fi

outputs_code="$(curl_status "${API_BASE}/api/v1/projects/demo-project/outputs")"
if is_public_auth_gate_code "$outputs_code"; then
  echo "✓ design-api GET /projects/{id}/outputs unauthenticated → $outputs_code (auth gate)"
  pass=$((pass + 1))
else
  echo "✗ design-api GET /projects/{id}/outputs unauthenticated → $outputs_code (expected 401/403/302)"
  fail=$((fail + 1))
fi

project_get_code="$(curl_status "${API_BASE}/api/v1/projects/demo-project")"
if is_public_auth_gate_code "$project_get_code"; then
  echo "✓ design-api GET /projects/{id} unauthenticated → $project_get_code (auth gate)"
  pass=$((pass + 1))
else
  echo "✗ design-api GET /projects/{id} unauthenticated → $project_get_code (expected 401/403/302)"
  fail=$((fail + 1))
fi

# nginx gate (10 §3.3): /api/internal/ blocked from public internet
internal_public_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"user_id":"x","workspace_id":"y","model_name":"m","input_tokens":0,"output_tokens":0,"run_id":"r"}' \
  "${API_BASE}/api/internal/usage/events")"
if [[ "$internal_public_code" == "403" ]]; then
  echo "✓ design-api POST /api/internal/usage/events (public) → 403 (nginx deny)"
  pass=$((pass + 1))
elif [[ "$internal_public_code" == "404" ]]; then
  echo "✓ design-api POST /api/internal/usage/events (public) → 404 (blocked)"
  pass=$((pass + 1))
else
  echo "✗ design-api POST /api/internal/usage/events (public) → $internal_public_code (expected 403/404)"
  fail=$((fail + 1))
fi

billing_public_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"smoke-w","amount":0}' \
  "${API_BASE}/api/internal/billing/reserve")"
if [[ "$billing_public_code" == "403" || "$billing_public_code" == "404" ]]; then
  echo "✓ design-api POST /api/internal/billing/reserve (public) → $billing_public_code (nginx deny)"
  pass=$((pass + 1))
else
  echo "✗ design-api POST /api/internal/billing/reserve (public) → $billing_public_code (expected 403/404)"
  fail=$((fail + 1))
fi

for billing_path in commit refund; do
  billing_pub_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"usage_id":"smoke"}' \
    "${API_BASE}/api/internal/billing/${billing_path}")"
  if [[ "$billing_pub_code" == "403" || "$billing_pub_code" == "404" ]]; then
    echo "✓ design-api POST /api/internal/billing/${billing_path} (public) → $billing_pub_code (nginx deny)"
    pass=$((pass + 1))
  else
    echo "✗ design-api POST /api/internal/billing/${billing_path} (public) → $billing_pub_code (expected 403/404)"
    fail=$((fail + 1))
  fi
done

token_usage_public_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  "${API_BASE}/api/token-usage/by-model?user_id=x&workspace_id=y&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z")"
if [[ "$token_usage_public_code" == "401" || "$token_usage_public_code" == "403" || "$token_usage_public_code" == "422" ]]; then
  echo "✓ design-api GET /api/token-usage without M2M key → $token_usage_public_code"
  pass=$((pass + 1))
else
  echo "✗ design-api GET /api/token-usage without M2M key → $token_usage_public_code (expected 401/403/422)"
  fail=$((fail + 1))
fi

design_api_root_code="$(curl_status "${API_BASE}/")"
if [[ "$design_api_root_code" == "404" ]]; then
  echo "✓ design-api / catch-all → 404 (no silent proxy)"
  pass=$((pass + 1))
else
  echo "✗ design-api / catch-all → $design_api_root_code (expected 404 after nginx hardening)"
  fail=$((fail + 1))
fi

if [[ -n "${TEAMVER_INTERNAL_API_KEY:-}" ]]; then
  internal_base="${DESIGN_API_LOCAL_URL:-$API_BASE}"
  if [[ "$internal_base" == "$API_BASE" && "$internal_public_code" == "403" ]]; then
    echo "○ skip internal usage M2M via public URL (nginx blocks /api/internal/; set DESIGN_API_LOCAL_URL=http://127.0.0.1:16000 on VM)"
  else
  usage_internal_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -X POST \
    -H "X-Teamver-Internal-Api-Key: ${TEAMVER_INTERNAL_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"user_id":"smoke-u","workspace_id":"smoke-w","model_name":"smoke-model","input_tokens":0,"output_tokens":0,"run_id":"smoke-run"}' \
    "${internal_base}/api/internal/usage/events")"
  if [[ "$usage_internal_code" == "204" ]]; then
    echo "✓ design-api POST /api/internal/usage/events (M2M) → 204"
    pass=$((pass + 1))
  else
    echo "✗ design-api POST /api/internal/usage/events (M2M) → $usage_internal_code (expected 204)"
    fail=$((fail + 1))
  fi

  billing_reserve_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -X POST \
    -H "X-Teamver-Internal-Api-Key: ${TEAMVER_INTERNAL_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"workspace_id":"smoke-w","amount":0,"reason":"smoke"}' \
    "${internal_base}/api/internal/billing/reserve")"
  if [[ "$billing_reserve_code" == "200" ]]; then
    echo "✓ design-api POST /api/internal/billing/reserve (M2M) → 200"
    pass=$((pass + 1))
  else
    echo "✗ design-api POST /api/internal/billing/reserve (M2M) → $billing_reserve_code (expected 200)"
    fail=$((fail + 1))
  fi
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

# Self-probe: restore_app_sqlite_from_s3.sh --dry-run.
# Confirms the runbook script still parses and resolves env-file paths
# correctly. We use --dry-run so no aws/litestream/docker calls fire.
# Skipped when the matching env file is missing (developer laptops).
restore_script="$ROOT/scripts/restore_app_sqlite_from_s3.sh"
if [[ -x "$restore_script" ]]; then
  restore_env_flag=""
  case "$DESIGN_HOST" in
    stg-*|staging*) restore_env_flag="--staging" ;;
    design.teamver.com) restore_env_flag="--production" ;;
  esac
  env_file_candidate=""
  if [[ "$restore_env_flag" == "--staging" ]]; then
    env_file_candidate="$ROOT/.env.staging"
  elif [[ "$restore_env_flag" == "--production" ]]; then
    env_file_candidate="$ROOT/.env.production"
  fi
  if [[ -n "$restore_env_flag" && -n "$env_file_candidate" && -f "$env_file_candidate" ]]; then
    if bash "$restore_script" "$restore_env_flag" --litestream --dry-run >/dev/null 2>&1; then
      echo "✓ restore_app_sqlite_from_s3.sh ${restore_env_flag} --litestream --dry-run"
      pass=$((pass + 1))
    else
      echo "✗ restore_app_sqlite_from_s3.sh ${restore_env_flag} --litestream --dry-run failed"
      fail=$((fail + 1))
    fi
  else
    echo "○ skip restore_app_sqlite_from_s3.sh probe (no matching .env.${restore_env_flag#--} on host)"
  fi
fi

if [[ -n "${TEAMVER_COOKIE:-}" ]]; then
  authed_runtime="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    "${API_BASE}/api/v1/runtime-config")"
  if [[ "$authed_runtime" == "200" ]]; then
    echo "✓ design-api /api/v1/runtime-config (cookie) → 200"
    pass=$((pass + 1))
    runtime_json="$(curl -sf --max-time 15 -H "Cookie: ${TEAMVER_COOKIE}" \
      "${API_BASE}/api/v1/runtime-config" 2>/dev/null || echo "")"
    if echo "$runtime_json" | grep -q '"configured"'; then
      echo "✓ runtime-config JSON shape ok"
      pass=$((pass + 1))
      managed_ok="$(echo "$runtime_json" | python3 -c "import json,sys; d=json.load(sys.stdin); print('1' if d.get('configured') else '0')" 2>/dev/null || echo "0")"
      if [[ "$managed_ok" == "1" ]]; then
        echo "✓ runtime-config configured=true (embed managed API)"
        pass=$((pass + 1))
      elif [[ "$ENV_LABEL" == "staging" && "${SMOKE_REQUIRE_MANAGED_API:-1}" == "1" ]]; then
        echo "✗ runtime-config configured=false — TEAMVER_OD_API_KEY 미주입? (embed chat 불가)"
        fail=$((fail + 1))
      else
        echo "○ runtime-config configured=false"
      fi
    else
      echo "✗ runtime-config JSON missing configured field"
      fail=$((fail + 1))
    fi
  else
    echo "✗ design-api /api/v1/runtime-config (cookie) → $authed_runtime (expected 200)"
    fail=$((fail + 1))
  fi

  session_json="$(curl -sf --max-time 15 -H "Cookie: ${TEAMVER_COOKIE}" \
    "${API_BASE}/api/v1/auth/session" 2>/dev/null || echo "")"
  if [[ -n "$session_json" ]] && echo "$session_json" | grep -q '"authenticated":true'; then
    workspace_count="$(echo "$session_json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('workspaces') or []))" 2>/dev/null || echo "0")"
    if [[ "$workspace_count" -ge 1 ]]; then
      echo "✓ design-api /api/v1/auth/session workspaces=$workspace_count"
      pass=$((pass + 1))
      app_enabled_count="$(echo "$session_json" | python3 -c "import json,sys; d=json.load(sys.stdin); ws=d.get('workspaces') or []; print(sum(1 for w in ws if w.get('app_enabled') is not False))" 2>/dev/null || echo "0")"
      if [[ "$app_enabled_count" -ge 1 ]]; then
        echo "✓ design-api session workspaces include app_enabled metadata ($app_enabled_count enabled)"
        pass=$((pass + 1))
      else
        echo "○ design-api session workspaces missing app_enabled=true entries"
      fi
    else
      echo "○ design-api /api/v1/auth/session authenticated but workspaces empty"
    fi
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

  if [[ -n "${TEAMVER_WORKSPACE_ID:-}" ]]; then
    usage_run_id="smoke-fe-$(date +%s)"
    usage_body="$(mktemp)"
    usage_fe_code="$(curl -s -o "$usage_body" -w '%{http_code}' --max-time 15 \
      -X POST \
      -H "Cookie: ${TEAMVER_COOKIE}" \
      -H "Content-Type: application/json" \
      -H "X-Workspace-Id: ${TEAMVER_WORKSPACE_ID}" \
      -d "{\"workspaceId\":\"${TEAMVER_WORKSPACE_ID}\",\"modelName\":\"smoke-model\",\"inputTokens\":1,\"outputTokens\":2,\"runId\":\"${usage_run_id}\"}" \
      "${API_BASE}/api/v1/usage/events")"
    if [[ "$usage_fe_code" == "202" ]]; then
      usage_request_id="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('requestId') or d.get('request_id') or '')" "$usage_body" 2>/dev/null || true)"
      if [[ -n "$usage_request_id" ]]; then
        echo "✓ design-api POST /api/v1/usage/events (cookie+camelCase) → 202 requestId=${usage_request_id}"
      else
        echo "✓ design-api POST /api/v1/usage/events (cookie+camelCase) → 202"
      fi
      pass=$((pass + 1))
    elif [[ "$usage_fe_code" == "403" ]]; then
      echo "○ design-api POST /api/v1/usage/events (cookie) → 403 (design app disabled for workspace?)"
    else
      echo "✗ design-api POST /api/v1/usage/events (cookie+camelCase) → $usage_fe_code (expected 202)"
      fail=$((fail + 1))
    fi
    rm -f "$usage_body"
  else
    echo "○ skip FE usage/events smoke (set TEAMVER_WORKSPACE_ID with TEAMVER_COOKIE)"
  fi

  bootstrap_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    "${API_BASE}/api/v1/bootstrap")"
  if [[ "$bootstrap_code" == "200" ]]; then
    echo "✓ design-api /api/v1/bootstrap (cookie) → 200"
    pass=$((pass + 1))
  elif [[ "$bootstrap_code" == "401" || "$bootstrap_code" == "403" ]]; then
    echo "○ design-api /api/v1/bootstrap (cookie) → $bootstrap_code (session expired?)"
  else
    echo "✗ design-api /api/v1/bootstrap (cookie) → $bootstrap_code (expected 200)"
    fail=$((fail + 1))
  fi

  access_project_id="${TEAMVER_OD_PROJECT_ID:-}"
  if [[ -z "$access_project_id" && "$projects_list" == "200" ]]; then
    access_project_id="$(curl -sf --max-time 15 \
      -H "Cookie: ${TEAMVER_COOKIE}" \
      "${workspace_hdr[@]}" \
      "${API_BASE}/api/v1/projects" \
      | python3 -c "import json,sys; d=json.load(sys.stdin); ps=d.get('projects') or []; print((ps[0].get('odProjectId') or ps[0].get('od_project_id') or '').strip())" 2>/dev/null || true)"
  fi
  if [[ -n "$access_project_id" && -n "${TEAMVER_WORKSPACE_ID:-}" ]]; then
    access_headers="$(curl -s -D - -o /dev/null --max-time 15 \
      -H "Cookie: ${TEAMVER_COOKIE}" \
      -H "X-Workspace-Id: ${TEAMVER_WORKSPACE_ID}" \
      "${API_BASE}/api/v1/projects/${access_project_id}/access" 2>/dev/null || true)"
    access_code="$(echo "$access_headers" | awk 'toupper($1) ~ /^HTTP/ { print $2; exit }')"
    s3_prefix="$(echo "$access_headers" | awk -F': ' 'tolower($1)=="x-teamver-s3-prefix" { print $2; exit }' | tr -d '\r')"
    if [[ "$access_code" == "204" ]]; then
      echo "✓ design-api GET /projects/{id}/access → 204"
      pass=$((pass + 1))
      if [[ -n "$s3_prefix" ]]; then
        echo "✓ design-api access X-Teamver-S3-Prefix present"
        pass=$((pass + 1))
      else
        echo "○ design-api access without X-Teamver-S3-Prefix (OD_PROJECT_STORAGE=local?)"
      fi
    elif [[ "$access_code" == "401" || "$access_code" == "403" || "$access_code" == "404" ]]; then
      echo "○ design-api GET /projects/{id}/access → $access_code (project $access_project_id)"
    else
      echo "✗ design-api GET /projects/{id}/access → ${access_code:-000} (expected 204)"
      fail=$((fail + 1))
    fi

    outputs_list_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
      -H "Cookie: ${TEAMVER_COOKIE}" \
      -H "X-Workspace-Id: ${TEAMVER_WORKSPACE_ID}" \
      "${API_BASE}/api/v1/projects/${access_project_id}/outputs")"
    if [[ "$outputs_list_code" == "200" ]]; then
      echo "✓ design-api GET /projects/{id}/outputs (cookie) → 200"
      pass=$((pass + 1))
    elif [[ "$outputs_list_code" == "401" || "$outputs_list_code" == "403" || "$outputs_list_code" == "404" ]]; then
      echo "○ design-api GET /projects/{id}/outputs → $outputs_list_code"
    else
      echo "✗ design-api GET /projects/{id}/outputs → $outputs_list_code (expected 200)"
      fail=$((fail + 1))
    fi

    project_detail_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
      -H "Cookie: ${TEAMVER_COOKIE}" \
      -H "X-Workspace-Id: ${TEAMVER_WORKSPACE_ID}" \
      "${API_BASE}/api/v1/projects/${access_project_id}")"
    if [[ "$project_detail_code" == "200" ]]; then
      echo "✓ design-api GET /projects/{id} (cookie) → 200"
      pass=$((pass + 1))
    elif [[ "$project_detail_code" == "401" || "$project_detail_code" == "403" || "$project_detail_code" == "404" ]]; then
      echo "○ design-api GET /projects/{id} → $project_detail_code"
    else
      echo "✗ design-api GET /projects/{id} → $project_detail_code (expected 200)"
      fail=$((fail + 1))
    fi
  else
    echo "○ skip project /access smoke (set TEAMVER_OD_PROJECT_ID or ensure registered projects)"
  fi
else
  echo "○ skip authenticated runtime-config (set TEAMVER_COOKIE to enable)"
fi

if [[ -x "$ROOT/scripts/seed_od_runtime_config.sh" ]]; then
  echo "○ seed_od_runtime_config.sh present (run manually after compose up)"
fi

if [[ -x "$ROOT/scripts/run_staging_track_a_e2e.sh" ]]; then
  echo "○ full Track A E2E: bash scripts/run_staging_track_a_e2e.sh (smoke + manual checklist)"
fi

echo
echo "==> $pass passed, $fail failed"
if (( fail > 0 )); then
  exit 1
fi
