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
  DESIGN_API_LOCAL_URL (optional — loopback M2M when nginx blocks /api/internal/ publicly)
  TEAMVER_COOKIE (optional session cookie)
  TEAMVER_WORKSPACE_ID (optional — projects list + M2M by-model check)
  TEAMVER_OD_PROJECT_ID (optional — /projects/{id}/access + S3 prefix header)
  TEAMVER_INTERNAL_API_KEY (optional — internal usage + token-usage M2M)
  OD_PROJECT_STORAGE (optional — deps config.project_storage 일치 검증)
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

echo "==> Teamver Design smoke"
echo "    OD:         $DESIGN_BASE"
echo "    design-api: $API_BASE"
echo

check "OD daemon /api/health" curl_ok "${DESIGN_BASE}/api/health"
check "design-api /api/healthz" curl_ok "${API_BASE}/api/healthz"
check "design-api /api/healthz/deps" curl_ok "${API_BASE}/api/healthz/deps"

scratch_sync_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -X POST \
  "${DESIGN_BASE}/api/projects/_smoke_probe_/scratch/sync-up" 2>/dev/null || echo "000")"
if [[ "$scratch_sync_code" == "401" ]]; then
  echo "✓ OD daemon POST …/scratch/sync-up → 401 (teamver access gate)"
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
if [[ -n "$deps_json" ]] && [[ -n "${OD_PROJECT_STORAGE:-}" ]]; then
  storage="$(echo "$deps_json" | sed -n 's/.*"project_storage":"\([^"]*\)".*/\1/p' | head -1)"
  expected="$(printf '%s' "$OD_PROJECT_STORAGE" | tr '[:upper:]' '[:lower:]')"
  if [[ -n "$storage" && "$storage" == "$expected" ]]; then
    echo "✓ design-api deps config.project_storage=$storage"
    pass=$((pass + 1))
  elif [[ -n "$storage" ]]; then
    echo "✗ design-api deps project_storage=$storage (expected $expected)"
    fail=$((fail + 1))
  fi
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

outputs_code="$(curl_status "${API_BASE}/api/v1/projects/demo-project/outputs")"
if [[ "$outputs_code" == "401" || "$outputs_code" == "403" ]]; then
  echo "✓ design-api GET /projects/{id}/outputs unauthenticated → $outputs_code"
  pass=$((pass + 1))
else
  echo "✗ design-api GET /projects/{id}/outputs unauthenticated → $outputs_code (expected 401/403)"
  fail=$((fail + 1))
fi

project_get_code="$(curl_status "${API_BASE}/api/v1/projects/demo-project")"
if [[ "$project_get_code" == "401" || "$project_get_code" == "403" ]]; then
  echo "✓ design-api GET /projects/{id} unauthenticated → $project_get_code"
  pass=$((pass + 1))
else
  echo "✗ design-api GET /projects/{id} unauthenticated → $project_get_code (expected 401/403)"
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
