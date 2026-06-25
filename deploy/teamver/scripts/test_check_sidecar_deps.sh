#!/usr/bin/env bash
# Fixture — check_sidecar_deps.sh main_be deps parsing (loop 397+).
#
# Usage: bash deploy/teamver/scripts/test_check_sidecar_deps.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/check_sidecar_deps.sh"

if [[ ! -x "$SCRIPT" ]]; then
  echo "❌ missing or not executable: $SCRIPT"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

MOCK_BIN="$WORK/bin"
mkdir -p "$MOCK_BIN"

write_mock_curl() {
  local main_be_status="$1"
  cat > "$MOCK_BIN/curl" <<MOCK
#!/usr/bin/env bash
URL=""
WRITE_OUT=""
OUT_FILE=""
METHOD="GET"
POST_DATA=""
for ((i=1; i<=$#; i++)); do
  case "\${!i}" in
    -w) j=\$((i+1)); WRITE_OUT="\${!j}" ;;
    -o) j=\$((i+1)); OUT_FILE="\${!j}" ;;
    -X) j=\$((i+1)); METHOD="\${!j}" ;;
    --data) j=\$((i+1)); POST_DATA="\${!j}" ;;
  esac
done
for a in "\$@"; do URL="\$a"; done

emit() {
  if [[ -n "\$OUT_FILE" ]]; then
    printf '%s' "\$1" > "\$OUT_FILE"
  else
    printf '%s' "\$1"
  fi
}

case "\$URL" in
  *"/api/healthz/deps")
    emit '{"status":"degraded","checks":{"db":"ok","daemon":"ok","main_be":"${main_be_status}","od_storage":"ok"},"config":{"project_storage":"s3"}}'
  ;;
  *"/api/healthz")
  emit '{"status":"ok","tables":{"design_projects":"ok","design_outputs":"ok"}}'
  ;;
  *"/api/health")
    emit ""
  ;;
  *"/api/internal/billing/reserve")
    if [[ "\$WRITE_OUT" == "%{http_code}" ]]; then
      echo "401"
    else
      emit ""
    fi
  ;;
  *"/scratch/"*)
    if [[ "\$WRITE_OUT" == "%{http_code}" ]]; then
      echo "204"
    else
      emit ""
    fi
  ;;
  *)
    if [[ "\$WRITE_OUT" == "%{http_code}" ]]; then
      echo "200"
    else
      emit ""
    fi
  ;;
esac
MOCK
  chmod +x "$MOCK_BIN/curl"
}

run_deps_check() {
  local main_be_status="$1"
  write_mock_curl "$main_be_status"
  PATH="$MOCK_BIN:$PATH" \
    OD_PROJECT_STORAGE=s3 \
    bash "$SCRIPT" 2>&1
}

ok_out="$(run_deps_check ok)"
if ! grep -q '✓ deps main_be=ok' <<< "$ok_out"; then
  echo "❌ expected ✓ deps main_be=ok"
  echo "$ok_out"
  exit 1
fi
echo "✓ check_sidecar_deps passes when main_be=ok"

if bad_out="$(run_deps_check unavailable)"; then
  echo "❌ main_be=unavailable must fail check_sidecar_deps"
  echo "$bad_out"
  exit 1
fi
if ! grep -q '✗ deps main_be=unavailable' <<< "$bad_out"; then
  echo "❌ expected ✗ deps main_be=unavailable"
  echo "$bad_out"
  exit 1
fi
echo "✓ check_sidecar_deps fails when main_be=unavailable"

echo "✓ test_check_sidecar_deps fixture ok"
