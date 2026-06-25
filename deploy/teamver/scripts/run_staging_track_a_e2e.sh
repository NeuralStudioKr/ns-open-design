#!/usr/bin/env bash
# Teamver Design — Track A staging/production E2E (curl + RDS direct query).
#
# Replaces the manual checklist items in:
#   docs-teamver/10_세션·OD패치_보강.md §6 (S-8)
#   docs-teamver/11_Usage·Drive_Publish_보강.md §8 (U-6 / D-5)
#   docs-teamver/22_Drive_인증_Usage_연동_검토.md §5 (W-1, S-5, D-B1)
#   docs-teamver/25_플러그인_preview_샌드박스_nginx_보강.md (P-1 plugin asset)
#
# Strategy: design-api 의 정상 흐름을 curl 로 끝까지 두드린 다음 RDS 에서
# 결과 row 가 생겼는지 psql 로 직접 확인. browser/playwright 없이 EC2 cron
# 으로 돌릴 수 있다.
#
# Required env:
#   MAIN_BE_DATABASE_URL='postgresql://teamver_design_admin:...@host:5432/teamver_design_staging'
#   TEAMVER_COOKIE='teamver_access_token=...'           # user A — S-8/D-5
#   TEAMVER_INTERNAL_API_KEY=<same as design sidecar>   # U-6 M2M
#
# Optional env:
#   TEAMVER_COOKIE_USER_B='teamver_access_token=...'    # 다중 사용자 403 격리
#   TEAMVER_ALT_WORKSPACE_ID=<user A 의 두 번째 workspace> # W-1 header alignment (loop 355)
#   TEAMVER_OD_PROJECT_ID=<user A 가 만들었던 OD project id>
#   TEAMVER_DRIVE_IMPORT_ASSET_ID=<Drive asset id for D-6a import probe>
#   TEAMVER_DRIVE_IMPORT_FILENAME=<slide-friendly filename for D-6a, default e2e-import.txt>
#   TEAMVER_S3_BUCKET / OD_S3_BUCKET=<project data bucket> # S3 tenant object probe
#   TEAMVER_S3_PREFIX=<override tenant prefix>              # optional; default from /access header
#   SKIP_DRIVE_IMPORT_POLICY=1                          # D-6b policy-only probe 비활성
#   SKIP_S3_OBJECT=1                                     # S3 object probe 비활성
#   TEAMVER_E2E_RUN_PREFIX='e2e-staging-'                # usage row 식별자
#   SKIP_DRIVE=1                                         # publish phase 비활성
#   SKIP_DB=1                                            # RDS psql 직접 검증 비활성
#   DESIGN_API_HOST / DESIGN_HOST                        # --staging/--production override
#
# Usage:
#   bash scripts/run_staging_track_a_e2e.sh --staging
#   bash scripts/run_staging_track_a_e2e.sh --production
#   bash scripts/run_staging_track_a_e2e.sh --production --require-core
#
# Exit codes:
#   0 — 모든 phase 통과 (skip 항목 포함)
#   1 — 한 개 이상 hard fail
#
# Called from run_post_deploy_track_a.sh --e2e (Phase 9).

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_MODE=""
USE_HTTPS=true
REQUIRE_CORE=0
DESIGN_HOST="${DESIGN_HOST:-}"
DESIGN_API_HOST="${DESIGN_API_HOST:-}"

usage() {
  cat <<'EOF'
run_staging_track_a_e2e.sh — Track A 출시 게이트 E2E (curl + RDS)

  bash scripts/run_staging_track_a_e2e.sh --staging
  bash scripts/run_staging_track_a_e2e.sh --production

env:
  MAIN_BE_DATABASE_URL    psql URI (design-api RDS DB)
  TEAMVER_COOKIE          'teamver_access_token=...'
  TEAMVER_INTERNAL_API_KEY  daemon ↔ design-api M2M key (sidecar 동일)

optional:
  TEAMVER_COOKIE_USER_B   다중 사용자 403 격리 검증
  TEAMVER_ALT_WORKSPACE_ID  W-1 alt workspace + X-Workspace-Id permissions (loop 355)
  TEAMVER_OD_PROJECT_ID   D-5 publish / D-6 import 대상 (없으면 skip)
  TEAMVER_DRIVE_IMPORT_ASSET_ID  D-6a import-drive 성공 probe (없으면 skip)
  TEAMVER_DRIVE_IMPORT_FILENAME  D-6a import filename (default e2e-import.txt)
  TEAMVER_S3_BUCKET / OD_S3_BUCKET  S3 tenant object probe bucket
  TEAMVER_S3_PREFIX                 tenant prefix override (default: /access header)
  --require-core                    핵심 env/tool 누락 또는 skip 설정을 hard fail
  SKIP_RUNTIME=1                 S-8c runtime-config probe 비활성
  SKIP_DRIVE_IMPORT_POLICY=1     D-6b policy reject probe 비활성
  SKIP_S3_OBJECT=1               S3 tenant object probe 비활성
  TEAMVER_E2E_PLUGIN_PREVIEW=1   P-1 plugin asset no-auth probe (staging VM)
  SKIP_PLUGIN_PREVIEW=1          P-1 비활성
  SKIP_DRIVE=1 / SKIP_DB=1
  TEAMVER_E2E_RUN_PREFIX  usage run_id prefix (default e2e-)
EOF
}

while (( $# )); do
  case "$1" in
    --staging)
      ENV_MODE=staging
      DESIGN_HOST="${DESIGN_HOST:-stg-design.teamver.com}"
      DESIGN_API_HOST="${DESIGN_API_HOST:-stg-design-api.teamver.com}"
      ;;
    --production)
      ENV_MODE=production
      DESIGN_HOST="${DESIGN_HOST:-design.teamver.com}"
      DESIGN_API_HOST="${DESIGN_API_HOST:-design-api.teamver.com}"
      ;;
    --http) USE_HTTPS=false ;;
    --require-core) REQUIRE_CORE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ -z "$ENV_MODE" || -z "$DESIGN_API_HOST" ]]; then
  echo "❌ --staging 또는 --production 필요"
  usage
  exit 1
fi

scheme=https
[[ "$USE_HTTPS" != true ]] && scheme=http
API_BASE="${scheme}://${DESIGN_API_HOST}"
DESIGN_BASE="${scheme}://${DESIGN_HOST}"
BE_PORT="${BE_PORT:-16000}"
# nginx blocks /api/internal/* from the public internet — loopback only (smoke_design 동형).
INTERNAL_API_BASE="${DESIGN_API_LOCAL_URL:-http://127.0.0.1:${BE_PORT}}"

pass=0
fail=0
skip=0

passed() { echo "✓ $1"; pass=$((pass + 1)); }
failed() { echo "✗ $1"; fail=$((fail + 1)); }
skipped() { echo "○ $1"; skip=$((skip + 1)); }

# design-api /access 는 daemon od_project_id 만 허용. publish/import 는 DPRJ ref.
resolve_daemon_od_project_id() {
  local ref="${1:-}"
  if [[ -z "$ref" ]]; then
    return 1
  fi
  if [[ "$ref" != DPRJ-* ]]; then
    printf '%s' "$ref"
    return 0
  fi
  if [[ -z "${TEAMVER_COOKIE:-}" ]]; then
    return 1
  fi
  local proj_json od_id
  proj_json="$(curl_body "${API_BASE}/api/v1/projects/${ref}" -H "Cookie: ${TEAMVER_COOKIE}")"
  if command -v python3 >/dev/null 2>&1; then
    od_id="$(printf '%s' "$proj_json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('odProjectId') or d.get('od_project_id') or '')" 2>/dev/null || true)"
  else
    od_id="$(printf '%s' "$proj_json" | sed -n 's/.*"odProjectId":"\([^"]*\)".*/\1/p' | head -1)"
  fi
  if [[ -n "$od_id" ]]; then
    printf '%s' "$od_id"
    return 0
  fi
  return 1
}

parse_session_identity() {
  local body="$1"
  session_user_id=""
  session_workspace_id=""
  if command -v python3 >/dev/null 2>&1; then
    session_user_id="$(printf '%s' "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); u=d.get('user') or {}; print(u.get('id') or u.get('user_id') or '')" 2>/dev/null || true)"
    session_workspace_id="$(printf '%s' "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('default_workspace_id') or d.get('defaultWorkspaceId') or '')" 2>/dev/null || true)"
  fi
  if [[ -z "$session_workspace_id" ]]; then
    session_workspace_id="$(printf '%s' "$body" | sed -n 's/.*"default_workspace_id":"\([^"]*\)".*/\1/p' | head -1)"
  fi
  if [[ -z "$session_workspace_id" ]]; then
    session_workspace_id="$(printf '%s' "$body" | sed -n 's/.*"defaultWorkspaceId":"\([^"]*\)".*/\1/p' | head -1)"
  fi
  if [[ -z "$session_user_id" ]]; then
    session_user_id="$(printf '%s' "$body" | sed -n 's/.*"user_id":"\([^"]*\)".*/\1/p' | head -1)"
  fi
}

if [[ "$REQUIRE_CORE" -eq 1 ]]; then
  core_missing=()
  for name in TEAMVER_COOKIE TEAMVER_INTERNAL_API_KEY TEAMVER_OD_PROJECT_ID MAIN_BE_DATABASE_URL; do
    [[ -n "${!name:-}" ]] || core_missing+=("$name")
  done
  [[ -n "${TEAMVER_S3_BUCKET:-${OD_S3_BUCKET:-}}" ]] || core_missing+=("TEAMVER_S3_BUCKET")
  command -v psql >/dev/null 2>&1 || core_missing+=("psql")
  command -v aws >/dev/null 2>&1 || core_missing+=("aws")
  for name in SKIP_DB SKIP_DRIVE SKIP_S3_OBJECT; do
    [[ -z "${!name:-}" ]] || core_missing+=("${name}=must_be_unset")
  done
  if (( ${#core_missing[@]} > 0 )); then
    echo "❌ Track A core preflight failed: ${core_missing[*]}"
    echo "   production launch evidence requires auth, usage DB, Drive publish, and S3 object checks"
    exit 1
  fi
  echo "✓ Track A core preflight"
fi

curl_code() {
  local url="$1"
  shift
  curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@" "$url" 2>/dev/null || echo 000
}

curl_body() {
  local url="$1"
  shift
  curl -s --max-time 20 "$@" "$url" 2>/dev/null || true
}

curl_post_code() {
  local url="$1"
  local data="$2"
  shift 2
  curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST \
    -H "Content-Type: application/json" \
    --data "$data" "$@" "$url" 2>/dev/null || echo 000
}

curl_post_body() {
  local url="$1"
  local data="$2"
  shift 2
  curl -s --max-time 30 -X POST \
    -H "Content-Type: application/json" \
    --data "$data" "$@" "$url" 2>/dev/null || true
}

# ---- env preflight ----------------------------------------------------------
echo "==> Track A staging E2E ($ENV_MODE) — $API_BASE"

require_env_or_skip() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    skipped "$2 — $name 미설정"
    return 1
  fi
  return 0
}

# ---- S-8a: auth/session -----------------------------------------------------
session_workspace_id=""
session_user_id=""
if require_env_or_skip TEAMVER_COOKIE "S-8a auth/session"; then
  session_body="$(curl_body "${API_BASE}/api/v1/auth/session" -H "Cookie: ${TEAMVER_COOKIE}")"
  session_code="$(curl_code "${API_BASE}/api/v1/auth/session" -H "Cookie: ${TEAMVER_COOKIE}")"
  if [[ "$session_code" == "200" ]]; then
    parse_session_identity "$session_body"
    if [[ -n "$session_user_id" || -n "$session_workspace_id" ]]; then
      passed "S-8a auth/session 200 — user=${session_user_id:-?} workspace=${session_workspace_id:-?}"
    else
      failed "S-8a auth/session 200 but no user/workspace fields in body"
    fi
  elif [[ "$session_code" == "401" ]]; then
    failed "S-8a auth/session 401 — TEAMVER_COOKIE expired/invalid"
  else
    failed "S-8a auth/session ${session_code}"
  fi
fi

# ---- S-8b: project list -----------------------------------------------------
if [[ -n "$session_workspace_id" ]]; then
  list_code="$(curl_code "${API_BASE}/api/v1/projects?workspace_id=${session_workspace_id}" -H "Cookie: ${TEAMVER_COOKIE}")"
  if [[ "$list_code" == "200" ]]; then
    passed "S-8b /api/v1/projects?workspace_id=${session_workspace_id} → 200"
  elif [[ "$list_code" == "404" || "$list_code" == "400" ]]; then
    skipped "S-8b project list ${list_code} (workspace 없음 또는 path 다름) — manual sanity 권장"
  else
    failed "S-8b /api/v1/projects → ${list_code}"
  fi
else
  skipped "S-8b project list — session workspace 없음"
fi

# ---- W-1: explicit X-Workspace-Id (loop 354/355 workspace alignment) ---------
if [[ -z "${TEAMVER_ALT_WORKSPACE_ID:-}" ]]; then
  skipped "W-1 alt workspace header — TEAMVER_ALT_WORKSPACE_ID 미설정 (옵션)"
elif [[ -z "${TEAMVER_COOKIE:-}" ]]; then
  skipped "W-1 alt workspace header — TEAMVER_COOKIE 필요"
elif [[ "${TEAMVER_ALT_WORKSPACE_ID}" == "${session_workspace_id:-}" ]]; then
  skipped "W-1 alt workspace header — ALT equals session default (다른 workspace 지정 필요)"
else
  perm_code="$(curl_code "${API_BASE}/api/v1/permissions/${TEAMVER_ALT_WORKSPACE_ID}" \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    -H "X-Workspace-Id: ${TEAMVER_ALT_WORKSPACE_ID}")"
  case "$perm_code" in
    200)
      passed "W-1 permissions/${TEAMVER_ALT_WORKSPACE_ID} with X-Workspace-Id → 200"
      ;;
    401|403)
      failed "W-1 alt workspace permissions ${perm_code} — cookie lacks alt workspace membership"
      ;;
    *)
      failed "W-1 alt workspace permissions ${perm_code}"
      ;;
  esac
fi

# ---- S-5: daemon /api/runs + workspace header (loop 365 background run poll) --
if [[ -z "${TEAMVER_COOKIE:-}" ]]; then
  skipped "S-5 daemon /api/runs — TEAMVER_COOKIE 필요"
elif [[ -z "${session_workspace_id:-}" ]]; then
  skipped "S-5 daemon /api/runs — session workspace 없음"
else
  runs_body="$(curl_body "${DESIGN_BASE}/api/runs" \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    -H "X-Workspace-Id: ${session_workspace_id}")"
  runs_code="$(curl_code "${DESIGN_BASE}/api/runs" \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    -H "X-Workspace-Id: ${session_workspace_id}")"
  case "$runs_code" in
    200)
      if printf '%s' "$runs_body" | grep -q '"runs"'; then
        passed "S-5 ${DESIGN_HOST}/api/runs with X-Workspace-Id → 200 (runs payload)"
      else
        failed "S-5 /api/runs 200 but missing runs field — daemon proxy misconfigured"
      fi
      ;;
    401|403)
      failed "S-5 /api/runs ${runs_code} — cookie/session invalid on design host"
      ;;
    *)
      failed "S-5 /api/runs ${runs_code} — design nginx/daemon unreachable"
      ;;
  esac
fi

# ---- S-8c: runtime-config (embed slide/API-mode prerequisite) ---------------
if [[ -n "${SKIP_RUNTIME:-}" ]]; then
  skipped "S-8c runtime-config — SKIP_RUNTIME=1"
elif [[ -z "${TEAMVER_COOKIE:-}" ]]; then
  skipped "S-8c runtime-config — TEAMVER_COOKIE 필요"
else
  runtime_body="$(curl_body "${API_BASE}/api/v1/runtime-config" -H "Cookie: ${TEAMVER_COOKIE}")"
  runtime_code="$(curl_code "${API_BASE}/api/v1/runtime-config" -H "Cookie: ${TEAMVER_COOKIE}")"
  if [[ "$runtime_code" == "200" ]]; then
    if printf '%s' "$runtime_body" | grep -q '"configured"'; then
      if printf '%s' "$runtime_body" | grep -Eq '"configured"[[:space:]]*:[[:space:]]*true'; then
        if printf '%s' "$runtime_body" | grep -Eq '"model"[[:space:]]*:[[:space:]]*"[^"]+"'; then
          runtime_model="$(printf '%s' "$runtime_body" | sed -n 's/.*"model"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
          passed "S-8c runtime-config configured=true model=${runtime_model:-?}"
        else
          failed "S-8c runtime-config configured=true but model missing — embed API chat 불가"
        fi
      else
        failed "S-8c runtime-config configured=false — TEAMVER_OD_API_KEY 미주입 (슬라이드 채팅 불가)"
      fi
    else
      failed "S-8c runtime-config 200 but missing configured field"
    fi
  elif [[ "$runtime_code" == "401" || "$runtime_code" == "403" ]]; then
    failed "S-8c runtime-config ${runtime_code} — TEAMVER_COOKIE invalid"
  else
    failed "S-8c runtime-config ${runtime_code}"
  fi
fi

# ---- D-B1: drive browse BFF (embed same-origin → design-api → Main BE) --------
if [[ -z "${TEAMVER_COOKIE:-}" ]]; then
  skipped "D-B1 drive browse BFF — TEAMVER_COOKIE 필요"
elif [[ -z "${session_workspace_id:-}" ]]; then
  skipped "D-B1 drive browse BFF — session workspace 없음"
else
  drive_bff_url="${DESIGN_BASE}/teamver-bff/drive/api/drive/folder?shallow_tree=true"
  drive_bff_body="$(curl_body "$drive_bff_url" \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    -H "X-Workspace-Id: ${session_workspace_id}")"
  drive_bff_code="$(curl_code "$drive_bff_url" \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    -H "X-Workspace-Id: ${session_workspace_id}")"
  case "$drive_bff_code" in
    200)
      if printf '%s' "$drive_bff_body" | grep -qE 'root_folder_id|rootFolderId'; then
        passed "D-B1 ${DESIGN_HOST}/teamver-bff/drive browse folder shallow → 200"
      else
        failed "D-B1 drive browse 200 but missing root_folder_id in body"
      fi
      ;;
    401|403)
      failed "D-B1 drive browse BFF ${drive_bff_code} — cookie/workspace invalid"
      ;;
    502)
      failed "D-B1 drive browse BFF 502 — Main BE unreachable (teamver_drive_unreachable; /api/healthz/deps main_be 확인)"
      ;;
    *)
      failed "D-B1 drive browse BFF ${drive_bff_code}"
      ;;
  esac
fi

# ---- D-B2: drive shared-drive list BFF (complements D-B1 personal folder) ----
if [[ -z "${TEAMVER_COOKIE:-}" ]]; then
  skipped "D-B2 drive shared-drive BFF — TEAMVER_COOKIE 필요"
elif [[ -z "${session_workspace_id:-}" ]]; then
  skipped "D-B2 drive shared-drive BFF — session workspace 없음"
else
  drive_sd_url="${DESIGN_BASE}/teamver-bff/drive/api/v2/shared-drive"
  drive_sd_body="$(curl_body "$drive_sd_url" \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    -H "X-Workspace-Id: ${session_workspace_id}")"
  drive_sd_code="$(curl_code "$drive_sd_url" \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    -H "X-Workspace-Id: ${session_workspace_id}")"
  case "$drive_sd_code" in
    200)
      # Main BE returns List[SharedDriveResponse] — bare JSON array (possibly non-empty).
      if printf '%s' "$drive_sd_body" | grep -qE '^[[:space:]]*\[|shared_drive|sharedDrive|"data"'; then
        passed "D-B2 ${DESIGN_HOST}/teamver-bff/drive shared-drive list → 200"
      else
        failed "D-B2 shared-drive 200 but body shape unexpected"
      fi
      ;;
    401|403)
      failed "D-B2 shared-drive BFF ${drive_sd_code} — cookie/workspace invalid"
      ;;
    502)
      failed "D-B2 shared-drive BFF 502 — Main BE unreachable (teamver_drive_unreachable)"
      ;;
    *)
      failed "D-B2 shared-drive BFF ${drive_sd_code}"
      ;;
  esac
fi

# ---- D-B3: drive thumbnail batch BFF (POST presign — import modal path) -------
if [[ -z "${TEAMVER_COOKIE:-}" ]]; then
  skipped "D-B3 drive thumbnail batch BFF — TEAMVER_COOKIE 필요"
elif [[ -z "${session_workspace_id:-}" ]]; then
  skipped "D-B3 drive thumbnail batch BFF — session workspace 없음"
else
  drive_batch_url="${DESIGN_BASE}/teamver-bff/drive/api/v2/asset/object-url/batch"
  drive_batch_body='{"items":[{"asset_id":"e2e-thumbnail-probe","shared_drive_id":null}]}'
  batch_resp="$(curl_post_body "$drive_batch_url" "$drive_batch_body" \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    -H "X-Workspace-Id: ${session_workspace_id}")"
  batch_code="$(curl_post_code "$drive_batch_url" "$drive_batch_body" \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    -H "X-Workspace-Id: ${session_workspace_id}")"
  case "$batch_code" in
    200)
      if printf '%s' "$batch_resp" | grep -qE '"items"|"object_url"|objectUrl'; then
        passed "D-B3 ${DESIGN_HOST}/teamver-bff/drive thumbnail batch POST → 200"
      else
        failed "D-B3 thumbnail batch 200 but missing items in body"
      fi
      ;;
    400|404|422)
      passed "D-B3 thumbnail batch POST → ${batch_code} (BFF reachable; probe asset rejected by Main BE)"
      ;;
    401|403)
      failed "D-B3 thumbnail batch BFF ${batch_code} — cookie/workspace invalid"
      ;;
    502)
      failed "D-B3 thumbnail batch BFF 502 — Main BE unreachable (teamver_drive_unreachable)"
      ;;
    *)
      failed "D-B3 thumbnail batch BFF ${batch_code}"
      ;;
  esac
fi

# ---- U-6: usage event + 멱등 ------------------------------------------------
usage_event_ok=false
e2e_run_id=""
if require_env_or_skip TEAMVER_INTERNAL_API_KEY "U-6 usage M2M"; then
  prefix="${TEAMVER_E2E_RUN_PREFIX:-e2e-}"
  ts="$(date -u +'%Y%m%dT%H%M%SZ')"
  rand="$(printf '%04x' $((RANDOM % 65536)))"
  e2e_run_id="${prefix}${ts}-${rand}"
  body="{\"user_id\":\"${session_user_id:-e2e-user}\",\"workspace_id\":\"${session_workspace_id:-e2e-ws}\",\"model_name\":\"e2e-mock-model\",\"input_tokens\":1,\"output_tokens\":1,\"operation\":\"design_e2e\",\"run_id\":\"${e2e_run_id}\"}"

  usage_code1="$(curl_code "${INTERNAL_API_BASE}/api/internal/usage/events" \
    -X POST -H "Content-Type: application/json" \
    -H "X-Teamver-Internal-Api-Key: ${TEAMVER_INTERNAL_API_KEY}" \
    --data "$body")"
  if [[ "$usage_code1" == "204" || "$usage_code1" == "200" || "$usage_code1" == "202" ]]; then
    passed "U-6a /api/internal/usage/events ← ${usage_code1} (run_id=${e2e_run_id})"
    usage_event_ok=true
  else
    failed "U-6a /api/internal/usage/events ← ${usage_code1} (expected 204)"
  fi

  # 두 번째 요청은 dedupe — 응답은 동일하지만 row 는 1건이어야.
  if [[ "$usage_event_ok" == true ]]; then
    usage_code2="$(curl_code "${INTERNAL_API_BASE}/api/internal/usage/events" \
      -X POST -H "Content-Type: application/json" \
      -H "X-Teamver-Internal-Api-Key: ${TEAMVER_INTERNAL_API_KEY}" \
      --data "$body")"
    if [[ "$usage_code2" == "204" || "$usage_code2" == "200" || "$usage_code2" == "202" ]]; then
      passed "U-6b 멱등 두 번째 POST ← ${usage_code2}"
    else
      failed "U-6b 멱등 두 번째 POST ← ${usage_code2}"
    fi
  fi
fi

# ---- U-6: RDS row 직접 확인 -------------------------------------------------
if [[ "$usage_event_ok" == true && -z "${SKIP_DB:-}" ]]; then
  if [[ -z "${MAIN_BE_DATABASE_URL:-}" ]]; then
    skipped "U-6c RDS row 확인 — MAIN_BE_DATABASE_URL 미설정"
  elif ! command -v psql >/dev/null 2>&1; then
    skipped "U-6c RDS row 확인 — psql 미설치"
  else
    # schedule_token_usage_log 는 background task 라 약간의 지연이 있을 수 있음.
    sleep 2
    rows="$(PGOPTIONS='-c default_transaction_read_only=on' \
      psql "$MAIN_BE_DATABASE_URL" -At \
      -c "SELECT count(*) FROM ai_model_token_usages WHERE run_id = '${e2e_run_id}';" 2>/dev/null || echo "?")"
    if [[ "$rows" == "1" ]]; then
      passed "U-6c ai_model_token_usages row count=1 (멱등 검증 OK)"
    elif [[ "$rows" == "0" ]]; then
      failed "U-6c ai_model_token_usages row count=0 (background write 실패 or DB 미연결)"
    elif [[ "$rows" == "?" ]]; then
      failed "U-6c psql 실행 실패 (MAIN_BE_DATABASE_URL 잘못됨?)"
    else
      failed "U-6c ai_model_token_usages row count=${rows} (멱등 실패 — afind_usage_by_run dedup 깨짐)"
    fi
  fi
else
  [[ -z "${SKIP_DB:-}" ]] || skipped "U-6c RDS row 확인 — SKIP_DB=1"
fi

# ---- D-5: publish → design_outputs row -------------------------------------
# loop 178 — capture publish response body too so D-7 can verify
# `outputs[].driveAssetId` is populated on 201 and that 207/502 surface a
# meaningful per-output `errorCode`. Without the body check, the previous probe
# happily passed a "/publish 200" mock that uploaded nothing to Drive.
if [[ -n "${SKIP_DRIVE:-}" ]]; then
  skipped "D-5 publish — SKIP_DRIVE=1"
elif [[ -z "${TEAMVER_OD_PROJECT_ID:-}" ]]; then
  skipped "D-5 publish — TEAMVER_OD_PROJECT_ID 미설정"
elif [[ -z "${TEAMVER_COOKIE:-}" ]]; then
  skipped "D-5 publish — TEAMVER_COOKIE 필요"
else
  publish_tmp="$(mktemp)"
  publish_body='{}'
  if [[ -n "${TEAMVER_PUBLISH_ARTIFACT_FILE:-}" ]]; then
    publish_body="{\"artifactFile\":\"${TEAMVER_PUBLISH_ARTIFACT_FILE}\",\"formats\":[\"html\",\"zip\"]}"
  elif [[ -n "${TEAMVER_PUBLISH_FORMATS:-}" ]]; then
    publish_body="{\"formats\":${TEAMVER_PUBLISH_FORMATS}}"
  fi
  # URL must stay last so curl_code-style mocks (which take the trailing
  # positional as the URL) keep working.
  publish_code="$(curl -s -o "$publish_tmp" -w '%{http_code}' --max-time 30 \
    -X POST -H "Content-Type: application/json" \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    --data "$publish_body" \
    "${API_BASE}/api/v1/projects/${TEAMVER_OD_PROJECT_ID}/publish" 2>/dev/null || echo 000)"
  publish_resp="$(cat "$publish_tmp" 2>/dev/null || true)"
  rm -f "$publish_tmp"

  case "$publish_code" in
    200|201|202|207)
      passed "D-5a publish ${TEAMVER_OD_PROJECT_ID} ← ${publish_code}"

      # D-7 — verify body shape regardless of MAIN_BE_DATABASE_URL availability.
      # 201 → at least one `driveAssetId` non-empty.
      # 207 → at least one ready output AND at least one failed `errorCode`.
      # 502 → all-failed already raises BadGateway in BE, won't hit this branch.
      if [[ "$publish_code" == "201" ]]; then
        if printf '%s' "$publish_resp" \
          | grep -Eo '"driveAssetId"\s*:\s*"[^"]+"' \
          | grep -Eq '"driveAssetId"\s*:\s*"[^"]+"'; then
          passed "D-7 publish body outputs[].driveAssetId 채워짐"
        else
          failed "D-7 publish 201 인데 outputs[].driveAssetId 가 비어있음 (Drive 업로드 누락 의심)"
        fi
      elif [[ "$publish_code" == "207" ]]; then
        ready_n="$(printf '%s' "$publish_resp" \
          | grep -Eo '"publishStatus"\s*:\s*"ready"' \
          | wc -l | awk '{print $1}')"
        failed_codes="$(printf '%s' "$publish_resp" \
          | grep -Eo '"errorCode"\s*:\s*"[^"]+"' \
          | head -n3 \
          | tr '\n' ' ')"
        ready_asset="$(printf '%s' "$publish_resp" \
          | grep -Eo '"driveAssetId"\s*:\s*"[^"]+"' \
          | grep -Ev '"driveAssetId"\s*:\s*""' \
          | head -n1 || true)"
        if [[ "$ready_n" -ge 1 && -n "$failed_codes" ]]; then
          passed "D-7 publish 207 partial ok — ${failed_codes}"
          # loop 181 D-8 — partial success must still land at least one Drive asset.
          if [[ -n "$ready_asset" ]]; then
            passed "D-8 publish 207 ready output has driveAssetId"
          else
            failed "D-8 publish 207 인데 ready output 의 driveAssetId 가 비어있음"
          fi
        else
          failed "D-7 publish 207 인데 ready/failed 한쪽이 비어있음 — body=${publish_resp:0:200}"
        fi
      else
        # 200 / 202 — server returned non-standard status. Can't strictly
        # validate body shape. Surface a soft skip so the suite keeps going
        # but operators see the anomaly.
        skipped "D-7 publish ${publish_code} — non-standard status, body 검증 생략"
      fi

      if [[ -n "${MAIN_BE_DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
        # design_outputs.project_id = DPRJ ref, od_project_id = daemon id.
        sleep 1
        recent="$(PGOPTIONS='-c default_transaction_read_only=on' \
          psql "$MAIN_BE_DATABASE_URL" -At \
          -c "SELECT count(*) FROM design_outputs WHERE (project_id = '${TEAMVER_OD_PROJECT_ID}' OR od_project_id = '${TEAMVER_OD_PROJECT_ID}') AND published_at >= NOW() - INTERVAL '5 minutes';" 2>/dev/null || echo "?")"
        if [[ "$recent" =~ ^[1-9][0-9]*$ ]]; then
          passed "D-5b design_outputs row 생성 확인 (recent count=${recent})"
        elif [[ "$recent" == "0" ]]; then
          failed "D-5b design_outputs row 미생성 — publish 후 5분 내 row 없음"
        else
          skipped "D-5b psql 검증 스킵 (${recent})"
        fi
      else
        skipped "D-5b design_outputs psql 검증 — MAIN_BE_DATABASE_URL/psql 미가용"
      fi
      ;;
    401|403)
      failed "D-5a publish ${publish_code} — TEAMVER_COOKIE 인증 실패 or workspace 권한 부족"
      ;;
    404)
      failed "D-5a publish 404 — TEAMVER_OD_PROJECT_ID=${TEAMVER_OD_PROJECT_ID} 존재 안 함"
      ;;
    502)
      # publish_all_failed — extract the first errorCode for operator hint.
      first_code="$(printf '%s' "$publish_resp" \
        | grep -Eo '"errorCode"\s*:\s*"[^"]+"' \
        | head -n1 || true)"
      failed "D-5a publish 502 — ${first_code:-publish_all_failed}"
      ;;
    *)
      failed "D-5a publish ${publish_code}"
      ;;
  esac
fi

# ---- D-6b: import-drive policy reject (no Drive download) -------------------
# loop 162 — mp4 filename 은 policy 단계에서 거절. 실제 asset id 불필요.
if [[ -n "${SKIP_DRIVE:-}" ]]; then
  skipped "D-6b import-drive policy — SKIP_DRIVE=1"
elif [[ -n "${SKIP_DRIVE_IMPORT_POLICY:-}" ]]; then
  skipped "D-6b import-drive policy — SKIP_DRIVE_IMPORT_POLICY=1"
elif [[ -z "${TEAMVER_OD_PROJECT_ID:-}" ]]; then
  skipped "D-6b import-drive policy — TEAMVER_OD_PROJECT_ID 미설정"
elif [[ -z "${TEAMVER_COOKIE:-}" ]]; then
  skipped "D-6b import-drive policy — TEAMVER_COOKIE 필요"
elif [[ -z "${session_workspace_id:-}" ]]; then
  skipped "D-6b import-drive policy — session workspace 없음"
else
  policy_body='{"assets":[{"assetId":"e2e-policy-probe","filename":"clip.mp4"}]}'
  policy_tmp="$(mktemp)"
  policy_code="$(curl -s -o "$policy_tmp" -w '%{http_code}' --max-time 20 \
    -X POST -H "Content-Type: application/json" \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    -H "X-Workspace-Id: ${session_workspace_id}" \
    --data "$policy_body" \
    "${API_BASE}/api/v1/projects/${TEAMVER_OD_PROJECT_ID}/import-drive" 2>/dev/null || echo 000)"
  policy_resp="$(cat "$policy_tmp" 2>/dev/null || true)"
  rm -f "$policy_tmp"
  if [[ "$policy_code" == "502" ]] \
    && printf '%s' "$policy_resp" | grep -q 'unsupported_drive_import_file_type'; then
    passed "D-6b import-drive policy reject ← 502 (unsupported_drive_import_file_type)"
  elif [[ "$policy_code" == "502" ]]; then
    failed "D-6b import-drive policy 502 but missing unsupported_drive_import_file_type in body"
  elif [[ "$policy_code" == "401" || "$policy_code" == "403" ]]; then
    failed "D-6b import-drive policy ${policy_code} — TEAMVER_COOKIE/workspace 권한 부족"
  elif [[ "$policy_code" == "404" ]]; then
    failed "D-6b import-drive policy 404 — TEAMVER_OD_PROJECT_ID=${TEAMVER_OD_PROJECT_ID} 없음"
  else
    failed "D-6b import-drive policy expected 502, got ${policy_code}"
  fi
fi

# ---- D-6a: import-drive happy path (real Drive asset) -----------------------
if [[ -n "${SKIP_DRIVE:-}" ]]; then
  skipped "D-6a import-drive — SKIP_DRIVE=1"
elif [[ -z "${TEAMVER_OD_PROJECT_ID:-}" ]]; then
  skipped "D-6a import-drive — TEAMVER_OD_PROJECT_ID 미설정"
elif [[ -z "${TEAMVER_DRIVE_IMPORT_ASSET_ID:-}" ]]; then
  skipped "D-6a import-drive — TEAMVER_DRIVE_IMPORT_ASSET_ID 미설정 (D-6b policy probe는 별도)"
elif [[ -z "${TEAMVER_COOKIE:-}" ]]; then
  skipped "D-6a import-drive — TEAMVER_COOKIE 필요"
elif [[ -z "${session_workspace_id:-}" ]]; then
  skipped "D-6a import-drive — session workspace 없음"
else
  import_filename="${TEAMVER_DRIVE_IMPORT_FILENAME:-e2e-import.txt}"
  import_body="{\"assets\":[{\"assetId\":\"${TEAMVER_DRIVE_IMPORT_ASSET_ID}\",\"filename\":\"${import_filename}\"}]}"
  import_tmp="$(mktemp)"
  import_code="$(curl -s -o "$import_tmp" -w '%{http_code}' --max-time 20 \
    -X POST -H "Content-Type: application/json" \
    -H "Cookie: ${TEAMVER_COOKIE}" \
    -H "X-Workspace-Id: ${session_workspace_id}" \
    --data "$import_body" \
    "${API_BASE}/api/v1/projects/${TEAMVER_OD_PROJECT_ID}/import-drive" 2>/dev/null || echo 000)"
  import_resp="$(cat "$import_tmp" 2>/dev/null || true)"
  rm -f "$import_tmp"
  case "$import_code" in
    200|201|207)
      if printf '%s' "$import_resp" | grep -Eq '"imported"[[:space:]]*:[[:space:]]*\[[[:space:]]*\{'; then
        passed "D-6a import-drive ${TEAMVER_OD_PROJECT_ID} ← ${import_code} (asset=${TEAMVER_DRIVE_IMPORT_ASSET_ID}, filename=${import_filename})"
      else
        failed "D-6a import-drive ${import_code} but response has empty/missing imported[]"
      fi
      ;;
    401|403)
      failed "D-6a import-drive ${import_code} — TEAMVER_COOKIE/workspace 권한 부족"
      ;;
    404)
      failed "D-6a import-drive 404 — project 또는 asset 없음"
      ;;
    502)
      failed "D-6a import-drive 502 — Drive download 또는 daemon upload 전부 실패"
      ;;
    *)
      failed "D-6a import-drive ${import_code}"
      ;;
  esac
fi

# ---- S3 object: tenant prefix contains at least one object ------------------
if [[ -n "${SKIP_S3_OBJECT:-}" ]]; then
  skipped "S3 tenant object — SKIP_S3_OBJECT=1"
elif [[ -z "${TEAMVER_OD_PROJECT_ID:-}" ]]; then
  skipped "S3 tenant object — TEAMVER_OD_PROJECT_ID 미설정"
elif [[ -z "${TEAMVER_COOKIE:-}" ]]; then
  skipped "S3 tenant object — TEAMVER_COOKIE 필요"
else
  s3_bucket="${TEAMVER_S3_BUCKET:-${OD_S3_BUCKET:-}}"
  if [[ -z "$s3_bucket" ]]; then
    skipped "S3 tenant object — TEAMVER_S3_BUCKET 또는 OD_S3_BUCKET 미설정"
  elif ! command -v aws >/dev/null 2>&1; then
    skipped "S3 tenant object — aws CLI 미설치"
  else
    tenant_prefix="${TEAMVER_S3_PREFIX:-}"
    access_od_id="$(resolve_daemon_od_project_id "${TEAMVER_OD_PROJECT_ID}" || true)"
    if [[ -z "$access_od_id" ]]; then
      failed "S3 tenant object — daemon od_project_id resolve 실패 (TEAMVER_OD_PROJECT_ID=${TEAMVER_OD_PROJECT_ID})"
    elif [[ -z "$tenant_prefix" ]]; then
      headers_tmp="$(mktemp)"
      access_code="$(curl -s -o /dev/null -D "$headers_tmp" -w '%{http_code}' --max-time 20 \
        -H "Cookie: ${TEAMVER_COOKIE}" \
        "${API_BASE}/api/v1/projects/${access_od_id}/access" 2>/dev/null || echo 000)"
      if [[ "$access_code" == "204" || "$access_code" == "200" ]]; then
        tenant_prefix="$(awk 'BEGIN{IGNORECASE=1} /^X-Teamver-S3-Prefix:/ {sub(/\r$/,""); print substr($0, index($0,":")+1)}' "$headers_tmp" | xargs | head -1)"
      fi
      rm -f "$headers_tmp"
      if [[ -z "$tenant_prefix" ]]; then
        failed "S3 tenant object — /access ${access_code}, X-Teamver-S3-Prefix header 없음"
      fi
    fi

    if [[ -n "$tenant_prefix" ]]; then
      tenant_prefix="${tenant_prefix#/}"
      if aws s3 ls "s3://${s3_bucket}/${tenant_prefix}" --recursive --summarize 2>/dev/null \
          | grep -Eq 'Total Objects:[[:space:]]*[1-9][0-9]*'; then
        passed "S3 tenant object exists — s3://${s3_bucket}/${tenant_prefix}"
      else
        failed "S3 tenant object 없음 — s3://${s3_bucket}/${tenant_prefix}"
      fi
    fi
  fi
fi

# ---- 다중 사용자 403 (Phase 3 격리) -----------------------------------------
if [[ -z "${TEAMVER_COOKIE_USER_B:-}" ]]; then
  skipped "isolation — TEAMVER_COOKIE_USER_B 미설정 (옵션)"
elif [[ -z "${TEAMVER_OD_PROJECT_ID:-}" ]]; then
  skipped "isolation — TEAMVER_OD_PROJECT_ID 미설정 (옵션)"
else
  iso_access_id="$(resolve_daemon_od_project_id "${TEAMVER_OD_PROJECT_ID}" || true)"
  if [[ -z "$iso_access_id" ]]; then
    skipped "isolation — daemon od_project_id resolve 실패"
  else
    iso_code="$(curl_code "${API_BASE}/api/v1/projects/${iso_access_id}/access" \
      -H "Cookie: ${TEAMVER_COOKIE_USER_B}")"
    case "$iso_code" in
      403|404)
        passed "isolation user B → user A project /access ${iso_code} (403/404 OK)"
        ;;
      204|200)
        failed "isolation user B → user A project /access ${iso_code} — Phase 3 격리 BREACH"
        ;;
      401)
        failed "isolation user B cookie ${iso_code} — TEAMVER_COOKIE_USER_B 인증 실패"
        ;;
      *)
        failed "isolation unexpected code ${iso_code}"
        ;;
    esac
  fi
fi

# ---- P-1: plugin asset no-auth (sandbox subresource; docs-teamver/25) --------
if [[ -n "${SKIP_PLUGIN_PREVIEW:-}" ]]; then
  skipped "P-1 plugin asset no-auth — SKIP_PLUGIN_PREVIEW=1"
elif [[ -z "${TEAMVER_E2E_PLUGIN_PREVIEW:-}" ]]; then
  skipped "P-1 plugin asset no-auth — TEAMVER_E2E_PLUGIN_PREVIEW=1 미설정 (staging VM/cron)"
else
  plugin_asset_url="${DESIGN_BASE}/api/plugins/example-html-ppt-zhangzara-creative-mode/asset/assets/deck-stage.js"
  p1_headers="$(mktemp)"
  p1_code="$(curl -s -o /dev/null -D "$p1_headers" -w '%{http_code}' --max-time 20 "$plugin_asset_url" 2>/dev/null || echo 000)"
  p1_location="$(awk 'BEGIN{IGNORECASE=1} /^Location:/ {sub(/\r$/,""); print substr($0, index($0,":")+1)}' "$p1_headers" | xargs | head -1)"
  p1_csp="$(awk 'BEGIN{IGNORECASE=1} /^Content-Security-Policy:/ {sub(/\r$/,""); print substr($0, index($0,":")+2)}' "$p1_headers" | head -1)"
  rm -f "$p1_headers"
  case "$p1_code" in
    000)
      skipped "P-1 plugin asset — curl unreachable (offline?)"
      ;;
    200)
      if grep -q 'fonts.googleapis.com' <<< "$p1_csp"; then
        passed "P-1 plugin asset → 200 + Teamver CSP (fonts)"
      else
        failed "P-1 plugin asset 200 but CSP missing fonts.googleapis.com — nginx inc 미적용?"
      fi
      ;;
    404)
      passed "P-1 plugin asset → 404 (plugin 미설치; signin redirect 없음)"
      ;;
    302|301)
      if grep -qi 'auth/signin' <<< "$p1_location"; then
        failed "P-1 plugin asset ${p1_code} signin redirect — teamver-design-plugin-preview.inc 미적용"
      else
        failed "P-1 plugin asset unexpected redirect ${p1_code} → ${p1_location}"
      fi
      ;;
    401|403)
      failed "P-1 plugin asset ${p1_code} — session gate still on asset path"
      ;;
    *)
      failed "P-1 plugin asset ${p1_code}"
      ;;
  esac
fi

# ---- 결과 -------------------------------------------------------------------
echo
echo "==> Track A E2E: ${pass} passed, ${fail} failed, ${skip} skipped"
if (( fail > 0 )); then
  echo "❌ 출시 게이트 P0 (Track A E2E) 실패 — staging EC2 로그 확인 후 재시도"
  exit 1
fi
echo "✓ Track A E2E ok (skip 항목은 env 가 채워지면 자동 확장)"
exit 0
