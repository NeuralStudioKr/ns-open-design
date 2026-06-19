#!/usr/bin/env bash
# OD core smoke — Teamver design-api / registry 없이 daemon 자체 동작 점검 (curl, no browser).
#
# Usage (Design EC2, loopback):
#   bash scripts/verify_od_core.sh
#   bash scripts/verify_od_core.sh --url http://127.0.0.1:7457
#   bash scripts/verify_od_core.sh --staging --expect-teamver-gate
#
# Optional:
#   OD_API_TOKEN=... (non-loopback or nginx 경유 시 Bearer)
#   VERIFY_OD_PROJECT_SMOKE=1 — POST /api/projects + GET list (destructive: test project 1개)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DAEMON_URL="${VERIFY_OD_DAEMON_URL:-http://127.0.0.1:7456}"
EXPECT_TEAMVER_GATE=""
ENV_FILE=""
SERVICE="open-design-daemon"
PROJECT_SMOKE="${VERIFY_OD_PROJECT_SMOKE:-0}"

usage() {
  cat <<'EOF'
verify_od_core.sh — OD daemon core checks (health, skills/deck, BYOK config, Teamver gate)

  bash scripts/verify_od_core.sh
  bash scripts/verify_od_core.sh --url http://127.0.0.1:7457
  bash scripts/verify_od_core.sh --staging --expect-teamver-gate

Flags:
  --url URL              daemon base (default http://127.0.0.1:7456)
  --staging              read .env.staging for OD_API_TOKEN if needed
  --production           read .env.production
  --expect-teamver-gate  TEAMVER_DESIGN_API_URL 설정돼 있어야 pass
  --no-teamver-gate      TEAMVER_DESIGN_API_URL 비어 있어야 pass (격리 스택)
  --service NAME         docker exec 대상 (default open-design-daemon)
  --project-smoke        VERIFY_OD_PROJECT_SMOKE=1 — create/list test project

Env:
  OD_API_TOKEN           Bearer (optional on VM loopback)
  VERIFY_OD_DAEMON_URL   same as --url
EOF
}

while (( $# )); do
  case "$1" in
    --url) DAEMON_URL="${2:?}"; shift ;;
    --staging) ENV_FILE=".env.staging" ;;
    --production) ENV_FILE=".env.production" ;;
    --expect-teamver-gate) EXPECT_TEAMVER_GATE="yes" ;;
    --no-teamver-gate) EXPECT_TEAMVER_GATE="no" ;;
    --service) SERVICE="${2:?}"; shift ;;
    --project-smoke) PROJECT_SMOKE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
  shift
done

DAEMON_URL="${DAEMON_URL%/}"

if [[ -n "$ENV_FILE" && -f "$ROOT/$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ROOT/$ENV_FILE"
  set +a
fi

pass=0
fail=0
warn=0

ok() { echo "✓ $1"; pass=$((pass + 1)); }
bad() { echo "✗ $1"; fail=$((fail + 1)); }
note() { echo "○ $1"; warn=$((warn + 1)); }

resolve_docker_container() {
  local name="$1"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$name"; then
    echo "$name"
    return 0
  fi
  case "$name" in
    od-core-verify)
      if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "teamver-od-core-verify"; then
        echo "teamver-od-core-verify"
        return 0
      fi
      ;;
    open-design-daemon)
      if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "teamver-open-design-daemon"; then
        echo "teamver-open-design-daemon"
        return 0
      fi
      ;;
  esac
  echo ""
}

curl_auth_args=()
if [[ -n "${OD_API_TOKEN:-}" ]]; then
  curl_auth_args=(-H "Authorization: Bearer ${OD_API_TOKEN}")
fi

curl_daemon() {
  local path="$1"
  curl -sf --max-time 20 "${curl_auth_args[@]}" "${DAEMON_URL}${path}"
}

curl_daemon_code() {
  local path="$1"
  curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${curl_auth_args[@]}" "${DAEMON_URL}${path}" 2>/dev/null || echo "000"
}

echo "==> verify_od_core @ ${DAEMON_URL}"
echo

health_code="$(curl_daemon_code /api/health)"
if [[ "$health_code" == "200" ]]; then
  ok "GET /api/health → 200"
else
  bad "GET /api/health → ${health_code} (expected 200)"
fi

status_json=""
if status_json="$(curl_daemon /api/daemon/status 2>/dev/null)"; then
  ok "GET /api/daemon/status → 200"
  if command -v python3 >/dev/null 2>&1; then
    version="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))' <<< "$status_json" 2>/dev/null || true)"
    [[ -n "$version" ]] && note "daemon version: $version"
  fi
else
  bad "GET /api/daemon/status failed"
fi

skills_json=""
if skills_json="$(curl_daemon /api/skills 2>/dev/null)"; then
  ok "GET /api/skills → 200"
  if grep -q 'simple-deck\|magazine-web-ppt\|guizang' <<< "$skills_json"; then
    ok "deck skills present (simple-deck / magazine-web-ppt)"
  else
    bad "deck skills missing in /api/skills"
  fi
else
  bad "GET /api/skills failed"
fi

if curl_daemon /api/design-systems >/dev/null 2>&1; then
  ok "GET /api/design-systems → 200"
else
  bad "GET /api/design-systems failed"
fi

storage_code="$(curl_daemon_code /api/health/storage)"
if [[ "$storage_code" == "200" ]]; then
  storage_json="$(curl_daemon /api/health/storage 2>/dev/null || echo '{}')"
  if grep -q '"ok":true' <<< "$storage_json" || grep -q '"ok": true' <<< "$storage_json"; then
    ok "GET /api/health/storage → ok"
  else
    note "GET /api/health/storage → 200 but ok!=true (check S3/local config)"
  fi
elif [[ "$storage_code" == "404" ]]; then
  note "GET /api/health/storage → 404 (older daemon image)"
else
  bad "GET /api/health/storage → ${storage_code}"
fi

# Container env: Teamver gate
teamver_url=""
CONTAINER="$(resolve_docker_container "$SERVICE")"
if [[ -n "$CONTAINER" ]]; then
  teamver_url="$(docker exec "$CONTAINER" printenv TEAMVER_DESIGN_API_URL 2>/dev/null || true)"
  teamver_url="${teamver_url//$'\r'/}"
  if [[ -n "$teamver_url" ]]; then
    if [[ "$EXPECT_TEAMVER_GATE" == "no" ]]; then
      bad "TEAMVER_DESIGN_API_URL=$teamver_url (expected empty for OD-only verify)"
    elif [[ "$EXPECT_TEAMVER_GATE" == "yes" ]]; then
      ok "TEAMVER_DESIGN_API_URL set ($teamver_url)"
    else
      note "TEAMVER_DESIGN_API_URL=$teamver_url (Teamver gate ON — /access 연동 경로 활성)"
    fi
  else
    if [[ "$EXPECT_TEAMVER_GATE" == "yes" ]]; then
      bad "TEAMVER_DESIGN_API_URL empty (expected set on staging sidecar)"
    else
      ok "TEAMVER_DESIGN_API_URL unset (OD-only / no access gate)"
    fi
  fi

  app_cfg="$(docker exec "$CONTAINER" node -e "
const fs=require('fs');const p=(process.env.OD_DATA_DIR||'/app/.od')+'/app-config.json';
try{const j=JSON.parse(fs.readFileSync(p,'utf8'));console.log(JSON.stringify({
  mode:j.mode||null,
  onboardingCompleted:!!j.onboardingCompleted,
  apiProtocol:j.apiProtocol||null,
  hasApiKey:!!(j.apiKey&&String(j.apiKey).trim()),
  model:j.model||null
}));}catch(e){console.log('{}');}
" 2>/dev/null || echo '{}')"

  if grep -q '"hasApiKey":true' <<< "$app_cfg" || grep -q '"hasApiKey": true' <<< "$app_cfg"; then
    ok "app-config BYOK apiKey configured"
  else
    note "app-config apiKey missing — bash scripts/seed_od_byok_app_config.sh 실행"
  fi

  if grep -q '"mode":"api"' <<< "$app_cfg" || grep -q '"mode": "api"' <<< "$app_cfg"; then
    ok "app-config mode=api"
  else
    note "app-config mode!=api (Local CLI 또는 미설정)"
  fi
else
  note "container $SERVICE not running — skip env/app-config checks"
fi

DAEMON_PORT="${DAEMON_URL##*:}"
DAEMON_PORT="${DAEMON_PORT%%/*}"

if [[ "$PROJECT_SMOKE" == "1" ]]; then
  test_id="od-core-verify-$(date +%s)"
  create_body="$(printf '{"id":"%s","name":"OD Core Verify","skillId":null,"designSystemId":null}' "$test_id")"
  create_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
    -X POST \
    -H "Content-Type: application/json" \
    "${curl_auth_args[@]}" \
    -d "$create_body" \
    "${DAEMON_URL}/api/projects" 2>/dev/null || echo "000")"
  if [[ "$create_code" == "200" ]]; then
    ok "POST /api/projects → 200 ($test_id)"
    list_json="$(curl_daemon /api/projects 2>/dev/null || echo '{}')"
    if grep -q "$test_id" <<< "$list_json"; then
      ok "GET /api/projects lists new project"
    else
      bad "GET /api/projects missing $test_id"
    fi
  else
    bad "POST /api/projects → $create_code"
  fi
fi

echo
echo "==> summary: pass=$pass fail=$fail note=$warn"
if [[ "$fail" -gt 0 ]]; then
  echo "❌ verify_od_core FAILED"
  exit 1
fi
echo "✓ verify_od_core OK"
echo
cat <<EOF
다음 (브라우저 — Deck 슬라이드 수동):
  1) SSH tunnel: ssh -L ${DAEMON_PORT}:127.0.0.1:${DAEMON_PORT} user@design-ec2
  2) http://127.0.0.1:${DAEMON_PORT} 열기
     (:7457 = OD-only 격리 · :7456 = staging nginx/Teamver sidecar)
  3) New project → Slide deck 탭
  4) Skill: simple-deck 또는 magazine-web-ppt
  5) 프롬프트: "5-slide pitch deck about AI design tools"
  6) artifact HTML + 슬라이드 prev/next 확인

자세한 runbook: docs-teamver/13_OD_단독_검증_서버_가이드.md
EOF
