#!/usr/bin/env bash
# Fixture — run_staging_track_a_e2e.sh graceful skip + mock-curl 시나리오.
#
# Usage: bash deploy/teamver/scripts/test_run_staging_track_a_e2e.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/run_staging_track_a_e2e.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "❌ missing $SCRIPT"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1) env 가 모두 없으면 5 skipped, exit 0.
unset_env() {
  unset TEAMVER_COOKIE TEAMVER_COOKIE_USER_B TEAMVER_INTERNAL_API_KEY \
        TEAMVER_OD_PROJECT_ID TEAMVER_DRIVE_IMPORT_ASSET_ID MAIN_BE_DATABASE_URL \
        TEAMVER_S3_BUCKET OD_S3_BUCKET TEAMVER_S3_PREFIX SKIP_DRIVE SKIP_DB \
        SKIP_DRIVE_IMPORT_POLICY SKIP_S3_OBJECT DESIGN_HOST DESIGN_API_HOST 2>/dev/null || true
}

unset_env
empty_out="$(bash "$SCRIPT" --staging 2>&1)"
if ! grep -q '0 passed, 0 failed, 9 skipped' <<< "$empty_out"; then
  echo "❌ empty-env run must skip 9 phases (got: $empty_out)"
  exit 1
fi
if ! grep -q '✓ Track A E2E ok' <<< "$empty_out"; then
  echo "❌ empty-env run must exit ok"
  echo "$empty_out"
  exit 1
fi
echo "✓ graceful skip when no env vars"

# 2) mock curl 으로 모든 200 → 통과. PATH 에 가짜 curl 을 prepend.
MOCK_BIN="$WORK/bin"
mkdir -p "$MOCK_BIN"
cat > "$MOCK_BIN/curl" <<'MOCK'
#!/usr/bin/env bash
URL=""
WRITE_OUT=""
OUT_FILE=""
POST_DATA=""
for ((i=1; i<=$#; i++)); do
  case "${!i}" in
    -w) j=$((i+1)); WRITE_OUT="${!j}" ;;
    -o) j=$((i+1)); OUT_FILE="${!j}" ;;
    --data) j=$((i+1)); POST_DATA="${!j}" ;;
  esac
done
for a in "$@"; do URL="$a"; done

emit_code() { [[ "$WRITE_OUT" == "%{http_code}" ]] && echo "$1"; }
emit_body() {
  local body="$1"
  if [[ -n "$OUT_FILE" ]]; then
    printf '%s' "$body" > "$OUT_FILE"
  else
    printf '%s' "$body"
  fi
}

case "$URL" in
  *"/api/auth/session")
    if [[ "$WRITE_OUT" == "%{http_code}" ]]; then
      emit_code 200
    else
      emit_body '{"user_id":"u-test","workspace_id":"ws-test","workspaceId":"ws-test"}'
    fi
    ;;
  *"/api/v1/projects?workspace_id="*)
    emit_code 200
    ;;
  *"/api/v1/runtime-config")
    if [[ "$WRITE_OUT" == "%{http_code}" ]]; then
      emit_code 200
    else
      emit_body '{"configured":true,"apiProtocol":"anthropic","baseUrl":"https://api.anthropic.com","model":"claude-sonnet-4-5"}'
    fi
    ;;
  *"/api/internal/usage/events")
    emit_code 204
    ;;
  *"/api/v1/projects/"*"/publish")
    emit_code 200
    ;;
  *"/api/v1/projects/"*"/import-drive")
    if [[ "$POST_DATA" == *"clip.mp4"* ]]; then
      if [[ "$WRITE_OUT" == "%{http_code}" ]]; then
        emit_code 502
        emit_body '{"projectId":"proj-e2e-1","imported":[],"failed":[{"assetId":"e2e-policy-probe","errorCode":"unsupported_drive_import_file_type"}]}'
      else
        emit_body '{"projectId":"proj-e2e-1","imported":[],"failed":[{"assetId":"e2e-policy-probe","errorCode":"unsupported_drive_import_file_type"}]}'
      fi
    elif [[ "$POST_DATA" != *"e2e-import.svg"* ]]; then
      emit_code 400
      emit_body '{"error":{"code":"bad_request","message":"missing test filename"}}'
    elif [[ "$WRITE_OUT" == "%{http_code}" ]]; then
      emit_code 201
      emit_body '{"projectId":"proj-e2e-1","imported":[{"assetId":"AST-E2E","path":"refs/e2e-import.svg","name":"e2e-import.svg","sizeBytes":12,"mimeType":"image/svg+xml"}],"failed":[]}'
    else
      emit_body '{"projectId":"proj-e2e-1","imported":[{"assetId":"AST-E2E","path":"refs/e2e-import.svg","name":"e2e-import.svg","sizeBytes":12,"mimeType":"image/svg+xml"}],"failed":[]}'
    fi
    ;;
  *"/api/v1/projects/"*"/access")
    emit_code 403
    ;;
  *)
    emit_code 200
    ;;
esac
MOCK
chmod +x "$MOCK_BIN/curl"

unset_env
PATH="$MOCK_BIN:$PATH" \
  TEAMVER_COOKIE='teamver_access_token=fake' \
  TEAMVER_INTERNAL_API_KEY='fake-m2m' \
  TEAMVER_OD_PROJECT_ID='proj-e2e-1' \
  TEAMVER_DRIVE_IMPORT_ASSET_ID='AST-E2E' \
  TEAMVER_DRIVE_IMPORT_FILENAME='e2e-import.svg' \
  TEAMVER_COOKIE_USER_B='teamver_access_token=other' \
  SKIP_DB=1 \
  SKIP_DRIVE= \
  ok_out="$(PATH="$MOCK_BIN:$PATH" \
    TEAMVER_COOKIE='teamver_access_token=fake' \
    TEAMVER_INTERNAL_API_KEY='fake-m2m' \
    TEAMVER_OD_PROJECT_ID='proj-e2e-1' \
    TEAMVER_DRIVE_IMPORT_ASSET_ID='AST-E2E' \
    TEAMVER_DRIVE_IMPORT_FILENAME='e2e-import.svg' \
    TEAMVER_COOKIE_USER_B='teamver_access_token=other' \
    SKIP_DB=1 \
    bash "$SCRIPT" --staging 2>&1)"

for needle in \
  'S-8a auth/session 200' \
  'S-8b /api/v1/projects' \
  'S-8c runtime-config configured=true' \
  'U-6a /api/internal/usage/events' \
  'U-6b 멱등 두 번째 POST' \
  'D-5a publish proj-e2e-1' \
  'D-6b import-drive policy reject' \
  'D-6a import-drive proj-e2e-1' \
  'isolation user B → user A project /access 403'
do
  if ! grep -q -- "$needle" <<< "$ok_out"; then
    echo "❌ mock-curl ok scenario missing: $needle"
    echo "$ok_out"
    exit 1
  fi
done
echo "✓ mock-curl all-200 scenario passes"

# 3) import-drive 201 with empty imported[] → fail.
cat > "$MOCK_BIN/curl" <<'MOCK'
#!/usr/bin/env bash
URL=""
WRITE_OUT=""
OUT_FILE=""
POST_DATA=""
for ((i=1; i<=$#; i++)); do
  case "${!i}" in
    -w) j=$((i+1)); WRITE_OUT="${!j}" ;;
    -o) j=$((i+1)); OUT_FILE="${!j}" ;;
    --data) j=$((i+1)); POST_DATA="${!j}" ;;
  esac
done
for a in "$@"; do URL="$a"; done
emit_code() { [[ "$WRITE_OUT" == "%{http_code}" ]] && echo "$1"; }
emit_body() {
  if [[ -n "$OUT_FILE" ]]; then
    printf '%s' "$1" > "$OUT_FILE"
  else
    printf '%s' "$1"
  fi
}
case "$URL" in
  *"/api/auth/session")
    if [[ "$WRITE_OUT" == "%{http_code}" ]]; then
      emit_code 200
    else
      emit_body '{"user_id":"u-test","workspace_id":"ws-test"}'
    fi
    ;;
  *"/api/v1/projects?workspace_id="*) emit_code 200 ;;
  *"/api/v1/runtime-config")
    if [[ "$WRITE_OUT" == "%{http_code}" ]]; then
      emit_code 200
    else
      emit_body '{"configured":true,"model":"claude-sonnet-4-5"}'
    fi
    ;;
  *"/api/internal/usage/events") emit_code 204 ;;
  *"/api/v1/projects/"*"/publish") emit_code 200 ;;
  *"/api/v1/projects/"*"/import-drive")
    if [[ "$POST_DATA" == *"clip.mp4"* ]]; then
      emit_code 502
      emit_body '{"projectId":"proj-e2e-1","imported":[],"failed":[{"assetId":"e2e-policy-probe","errorCode":"unsupported_drive_import_file_type"}]}'
    else
      emit_code 201
      emit_body '{"projectId":"proj-e2e-1","imported":[],"failed":[{"assetId":"AST-E2E","errorCode":"drive_download_failed"}]}'
    fi
    ;;
  *) emit_code 200 ;;
esac
MOCK
chmod +x "$MOCK_BIN/curl"

if PATH="$MOCK_BIN:$PATH" \
    TEAMVER_COOKIE='teamver_access_token=fake' \
    TEAMVER_INTERNAL_API_KEY='fake-m2m' \
    TEAMVER_OD_PROJECT_ID='proj-e2e-1' \
    TEAMVER_DRIVE_IMPORT_ASSET_ID='AST-E2E' \
    TEAMVER_DRIVE_IMPORT_FILENAME='e2e-import.svg' \
    SKIP_DB=1 \
    bash "$SCRIPT" --staging >/dev/null 2>&1; then
  echo "❌ import-drive empty imported[] must fail the script"
  exit 1
fi
echo "✓ mock-curl import empty scenario fails"

# 4) publish 401 → fail.
cat > "$MOCK_BIN/curl" <<'MOCK'
#!/usr/bin/env bash
URL=""
WRITE_OUT=""
for ((i=1; i<=$#; i++)); do
  case "${!i}" in
    -w) j=$((i+1)); WRITE_OUT="${!j}" ;;
  esac
done
for a in "$@"; do URL="$a"; done
emit_code() { [[ "$WRITE_OUT" == "%{http_code}" ]] && echo "$1"; }

case "$URL" in
  *"/api/auth/session")
    if [[ "$WRITE_OUT" == "%{http_code}" ]]; then
      emit_code 200
    else
      echo '{"user_id":"u-test","workspace_id":"ws-test"}'
    fi
    ;;
  *"/api/v1/projects?workspace_id="*) emit_code 200 ;;
  *"/api/internal/usage/events") emit_code 204 ;;
  *"/api/v1/projects/"*"/publish") emit_code 401 ;;
  *"/api/v1/projects/"*"/access") emit_code 403 ;;
  *) emit_code 200 ;;
esac
MOCK
chmod +x "$MOCK_BIN/curl"

if PATH="$MOCK_BIN:$PATH" \
    TEAMVER_COOKIE='teamver_access_token=fake' \
    TEAMVER_INTERNAL_API_KEY='fake-m2m' \
    TEAMVER_OD_PROJECT_ID='proj-e2e-1' \
    SKIP_DB=1 \
    bash "$SCRIPT" --staging >/dev/null 2>&1; then
  echo "❌ publish 401 must fail the script"
  exit 1
fi
echo "✓ mock-curl publish-401 scenario fails"

# 5) isolation breach (user B gets 200 access) → fail.
cat > "$MOCK_BIN/curl" <<'MOCK'
#!/usr/bin/env bash
URL=""
WRITE_OUT=""
for ((i=1; i<=$#; i++)); do
  case "${!i}" in
    -w) j=$((i+1)); WRITE_OUT="${!j}" ;;
  esac
done
for a in "$@"; do URL="$a"; done
emit_code() { [[ "$WRITE_OUT" == "%{http_code}" ]] && echo "$1"; }
case "$URL" in
  *"/api/auth/session")
    if [[ "$WRITE_OUT" == "%{http_code}" ]]; then
      emit_code 200
    else
      echo '{"user_id":"u","workspace_id":"w"}'
    fi
    ;;
  *"/api/v1/projects?workspace_id="*) emit_code 200 ;;
  *"/api/internal/usage/events") emit_code 204 ;;
  *"/api/v1/projects/"*"/publish") emit_code 200 ;;
  *"/api/v1/projects/"*"/access") emit_code 204 ;;
  *) emit_code 200 ;;
esac
MOCK
chmod +x "$MOCK_BIN/curl"

if PATH="$MOCK_BIN:$PATH" \
    TEAMVER_COOKIE='teamver_access_token=fake' \
    TEAMVER_INTERNAL_API_KEY='fake-m2m' \
    TEAMVER_OD_PROJECT_ID='proj-e2e-1' \
    TEAMVER_COOKIE_USER_B='teamver_access_token=other' \
    SKIP_DB=1 SKIP_DRIVE=1 \
    bash "$SCRIPT" --staging >/dev/null 2>&1; then
  echo "❌ isolation breach (user B 204) must fail"
  exit 1
fi
echo "✓ mock-curl isolation breach scenario fails"

# 6) S3 tenant object probe succeeds when bucket + /access prefix + aws CLI are present.
cat > "$MOCK_BIN/curl" <<'MOCK'
#!/usr/bin/env bash
URL=""
WRITE_OUT=""
HEADER_FILE=""
for ((i=1; i<=$#; i++)); do
  case "${!i}" in
    -w) j=$((i+1)); WRITE_OUT="${!j}" ;;
    -D) j=$((i+1)); HEADER_FILE="${!j}" ;;
  esac
done
for a in "$@"; do URL="$a"; done
emit_code() { [[ "$WRITE_OUT" == "%{http_code}" ]] && echo "$1"; }
case "$URL" in
  *"/api/auth/session")
    if [[ "$WRITE_OUT" == "%{http_code}" ]]; then
      emit_code 200
    else
      echo '{"user_id":"u","workspace_id":"w"}'
    fi
    ;;
  *"/api/v1/projects?workspace_id="*) emit_code 200 ;;
  *"/api/internal/usage/events") emit_code 204 ;;
  *"/api/v1/projects/"*"/access")
    if [[ -n "$HEADER_FILE" ]]; then
      printf 'HTTP/2 204\r\nX-Teamver-S3-Prefix: design/ws_w/user_u/proj_proj-e2e-1/\r\n\r\n' > "$HEADER_FILE"
    fi
    emit_code 204
    ;;
  *) emit_code 200 ;;
esac
MOCK
chmod +x "$MOCK_BIN/curl"

cat > "$MOCK_BIN/aws" <<'MOCK'
#!/usr/bin/env bash
if [[ "$*" == *"s3://teamver-design-staging-data/design/ws_w/user_u/proj_proj-e2e-1/"* ]]; then
  cat <<'EOF'
2026-06-19 00:00:00         12 index.html

Total Objects: 1
   Total Size: 12
EOF
  exit 0
fi
echo "unexpected aws args: $*" >&2
exit 1
MOCK
chmod +x "$MOCK_BIN/aws"

s3_out="$(PATH="$MOCK_BIN:$PATH" \
  TEAMVER_COOKIE='teamver_access_token=fake' \
  TEAMVER_INTERNAL_API_KEY='fake-m2m' \
  TEAMVER_OD_PROJECT_ID='proj-e2e-1' \
  TEAMVER_S3_BUCKET='teamver-design-staging-data' \
  SKIP_DB=1 SKIP_DRIVE=1 SKIP_RUNTIME=1 SKIP_DRIVE_IMPORT_POLICY=1 \
  bash "$SCRIPT" --staging 2>&1)"
if ! grep -q 'S3 tenant object exists' <<< "$s3_out"; then
  echo "❌ S3 object probe should pass with mock aws"
  echo "$s3_out"
  exit 1
fi
echo "✓ mock aws S3 tenant object scenario passes"

echo "✓ run_staging_track_a_e2e fixture ok"
