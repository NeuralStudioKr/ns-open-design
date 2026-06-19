#!/usr/bin/env bash
# Fixture checks for check_main_be_design_wiring.sh.
#
# Usage: bash deploy/teamver/scripts/test_check_main_be_design_wiring.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/check_main_be_design_wiring.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "❌ missing $SCRIPT"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

MAIN_ENV="$WORK/main.env.staging"
SIDE_ENV="$WORK/sidecar.env.staging"
cat > "$MAIN_ENV" <<'EOF'
TEAMVER_DESIGN_API_BASE_URL=https://stg-design-api.teamver.com
TEAMVER_INTERNAL_API_KEY=shared-m2m-key
EOF
cat > "$SIDE_ENV" <<'EOF'
TEAMVER_INTERNAL_API_KEY=shared-m2m-key
EOF

ok_out="$(SIDEcar_ENV_FILE="$SIDE_ENV" bash "$SCRIPT" --staging --env-file "$MAIN_ENV" 2>&1)"
if ! grep -q '✓ Main BE TEAMVER_DESIGN_API_BASE_URL=' <<< "$ok_out"; then
  echo "❌ expected URL match in output"
  echo "$ok_out"
  exit 1
fi

bad_env="$WORK/bad.env.staging"
echo 'TEAMVER_DESIGN_API_BASE_URL=https://wrong.example.com' > "$bad_env"
if bash "$SCRIPT" --staging --env-file "$bad_env" >/dev/null 2>&1; then
  echo "❌ expected failure for wrong design-api URL"
  exit 1
fi

missing_out="$(bash "$SCRIPT" --staging --env-file "$WORK/missing.env" 2>&1 || true)"
if ! grep -q 'env file not found' <<< "$missing_out"; then
  echo "❌ expected graceful skip when Main BE env missing"
  echo "$missing_out"
  exit 1
fi

if bash "$SCRIPT" --not-a-flag >/dev/null 2>&1; then
  echo "❌ expected failure for unknown flag"
  exit 1
fi

# ---------------------------------------------------------------------------
# loop 142 — --live M2M reachability fixture. Inject a mock curl that
# returns 200 for /api/healthz, JSON for /deps, and 422 for the M2M POST
# (validation_error — design-api received the call but body is empty).
# ---------------------------------------------------------------------------
MOCK_CURL_OK="$WORK/mock_curl_ok.sh"
cat > "$MOCK_CURL_OK" <<'MOCK'
#!/usr/bin/env bash
URL=""
WRITE_OUT=""
for ((i=1; i<=$#; i++)); do
  case "${!i}" in
    -w)
      j=$((i+1)); WRITE_OUT="${!j}" ;;
  esac
done
for a in "$@"; do URL="$a"; done
case "$URL" in
  *"/api/healthz/deps")
    echo '{"checks":{"db":"ok","od_storage":"ok","daemon":"ok"},"config":{"project_storage":"s3","registry_creds":"missing"}}'
    ;;
  *"/api/healthz")
    [[ "$WRITE_OUT" == "%{http_code}" ]] && echo 200
    ;;
  *"/api/internal/usage/events")
    [[ "$WRITE_OUT" == "%{http_code}" ]] && echo 422
    ;;
  *)
    [[ "$WRITE_OUT" == "%{http_code}" ]] && echo 000
    ;;
esac
MOCK
chmod +x "$MOCK_CURL_OK"

live_out="$(CURL_BIN="$MOCK_CURL_OK" SIDEcar_ENV_FILE="$SIDE_ENV" \
  bash "$SCRIPT" --staging --live --env-file "$MAIN_ENV" 2>&1)"
for needle in \
  '✓ design-api' \
  '/api/healthz → 200' \
  'deps config.project_storage=s3' \
  'deps checks.db=ok' \
  '/api/internal/usage/events M2M reachable (code=422)'
do
  if ! grep -q -- "$needle" <<< "$live_out"; then
    echo "❌ --live ok fixture missing: $needle"
    echo "$live_out"
    exit 1
  fi
done
echo "✓ check_main_be_design_wiring --live ok fixture"

# Unreachable design-api: mock returns 000 for everything → script fails.
MOCK_CURL_DOWN="$WORK/mock_curl_down.sh"
cat > "$MOCK_CURL_DOWN" <<'MOCK'
#!/usr/bin/env bash
WRITE_OUT=""
for ((i=1; i<=$#; i++)); do
  case "${!i}" in
    -w) j=$((i+1)); WRITE_OUT="${!j}" ;;
  esac
done
[[ "$WRITE_OUT" == "%{http_code}" ]] && echo 000
MOCK
chmod +x "$MOCK_CURL_DOWN"

if CURL_BIN="$MOCK_CURL_DOWN" SIDEcar_ENV_FILE="$SIDE_ENV" \
    bash "$SCRIPT" --staging --live --env-file "$MAIN_ENV" >/dev/null 2>&1; then
  echo "❌ --live with unreachable design-api must exit non-zero"
  exit 1
fi
echo "✓ check_main_be_design_wiring --live unreachable fixture"

# project_storage != s3 in deps must fail (Track A gate).
MOCK_CURL_LOCAL="$WORK/mock_curl_local.sh"
cat > "$MOCK_CURL_LOCAL" <<'MOCK'
#!/usr/bin/env bash
URL=""
WRITE_OUT=""
for ((i=1; i<=$#; i++)); do
  case "${!i}" in
    -w) j=$((i+1)); WRITE_OUT="${!j}" ;;
  esac
done
for a in "$@"; do URL="$a"; done
case "$URL" in
  *"/api/healthz/deps")
    echo '{"checks":{"db":"ok","od_storage":"degraded"},"config":{"project_storage":"local"}}'
    ;;
  *"/api/healthz")
    [[ "$WRITE_OUT" == "%{http_code}" ]] && echo 200 ;;
  *"/api/internal/usage/events")
    [[ "$WRITE_OUT" == "%{http_code}" ]] && echo 422 ;;
  *)
    [[ "$WRITE_OUT" == "%{http_code}" ]] && echo 000 ;;
esac
MOCK
chmod +x "$MOCK_CURL_LOCAL"

local_live_out="$(CURL_BIN="$MOCK_CURL_LOCAL" SIDEcar_ENV_FILE="$SIDE_ENV" \
  bash "$SCRIPT" --staging --live --env-file "$MAIN_ENV" 2>&1 || true)"
if ! grep -q 'project_storage=local (Track A requires s3)' <<< "$local_live_out"; then
  echo "❌ --live must fail when deps project_storage != s3"
  echo "$local_live_out"
  exit 1
fi
echo "✓ check_main_be_design_wiring --live storage-mode fixture"

echo "✓ check_main_be_design_wiring fixture ok"
