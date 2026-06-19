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
        TEAMVER_OD_PROJECT_ID MAIN_BE_DATABASE_URL SKIP_DRIVE SKIP_DB \
        DESIGN_HOST DESIGN_API_HOST 2>/dev/null || true
}

unset_env
empty_out="$(bash "$SCRIPT" --staging 2>&1)"
if ! grep -q '0 passed, 0 failed, 5 skipped' <<< "$empty_out"; then
  echo "❌ empty-env run must skip 5 phases (got: $empty_out)"
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
      echo '{"user_id":"u-test","workspace_id":"ws-test","workspaceId":"ws-test"}'
    fi
    ;;
  *"/api/v1/projects?workspace_id="*)
    emit_code 200
    ;;
  *"/api/internal/usage/events")
    emit_code 204
    ;;
  *"/api/v1/projects/"*"/publish")
    emit_code 200
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
  TEAMVER_COOKIE_USER_B='teamver_access_token=other' \
  SKIP_DB=1 \
  SKIP_DRIVE= \
  ok_out="$(PATH="$MOCK_BIN:$PATH" \
    TEAMVER_COOKIE='teamver_access_token=fake' \
    TEAMVER_INTERNAL_API_KEY='fake-m2m' \
    TEAMVER_OD_PROJECT_ID='proj-e2e-1' \
    TEAMVER_COOKIE_USER_B='teamver_access_token=other' \
    SKIP_DB=1 \
    bash "$SCRIPT" --staging 2>&1)"

for needle in \
  'S-8a auth/session 200' \
  'S-8b /api/v1/projects' \
  'U-6a /api/internal/usage/events' \
  'U-6b 멱등 두 번째 POST' \
  'D-5a publish proj-e2e-1' \
  'isolation user B → user A project /access 403'
do
  if ! grep -q -- "$needle" <<< "$ok_out"; then
    echo "❌ mock-curl ok scenario missing: $needle"
    echo "$ok_out"
    exit 1
  fi
done
echo "✓ mock-curl all-200 scenario passes"

# 3) publish 401 → fail.
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

# 4) isolation breach (user B gets 200 access) → fail.
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

echo "✓ run_staging_track_a_e2e fixture ok"
