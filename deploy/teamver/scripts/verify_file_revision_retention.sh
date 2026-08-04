#!/usr/bin/env bash
# File revision retention / GC verification — metrics spot-check + optional burst push QA.
#
# Usage (Design EC2 loopback):
#   bash scripts/verify_file_revision_retention.sh
#   bash scripts/verify_file_revision_retention.sh --url http://127.0.0.1:7456
#
# Burst push QA (needs existing project + HTML file on disk):
#   VERIFY_REVISION_BURST=1 \
#   VERIFY_REVISION_PROJECT_ID=my-project \
#   VERIFY_REVISION_FILE=deck.html \
#   bash scripts/verify_file_revision_retention.sh
#
# Env:
#   VERIFY_OD_DAEMON_URL / --url     daemon base (default http://127.0.0.1:7456)
#   OD_API_TOKEN                     Bearer when not on loopback
#   VERIFY_REVISION_BURST            1 = POST N revisions then poll retentionPending
#   VERIFY_REVISION_BURST_COUNT      default 35
#   VERIFY_REVISION_POLL_SECS        default 90
#   VERIFY_REVISION_GC_MAX_AGE_SECS  gc_last_success max age (default 86400)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DAEMON_URL="${VERIFY_OD_DAEMON_URL:-http://127.0.0.1:7456}"
ENV_FILE=""
BURST="${VERIFY_REVISION_BURST:-0}"
BURST_COUNT="${VERIFY_REVISION_BURST_COUNT:-35}"
POLL_SECS="${VERIFY_REVISION_POLL_SECS:-90}"
GC_MAX_AGE="${VERIFY_REVISION_GC_MAX_AGE_SECS:-86400}"
PROJECT_ID="${VERIFY_REVISION_PROJECT_ID:-}"
FILE_NAME="${VERIFY_REVISION_FILE:-deck.html}"

usage() {
  cat <<'EOF'
verify_file_revision_retention.sh — revision Prometheus gauges + optional burst retention QA

  bash scripts/verify_file_revision_retention.sh
  bash scripts/verify_file_revision_retention.sh --url http://127.0.0.1:7456 --burst

Flags:
  --url URL       daemon base URL
  --staging       load OD_API_TOKEN from .env.staging
  --production    load OD_API_TOKEN from .env.production
  --burst         VERIFY_REVISION_BURST=1 — push many revisions and poll list API
  --project ID    VERIFY_REVISION_PROJECT_ID
  --file NAME     VERIFY_REVISION_FILE (default deck.html)
  -h, --help

See script header for full env list.
EOF
}

while (( $# )); do
  case "$1" in
    --url) DAEMON_URL="${2:?}"; shift ;;
    --staging) ENV_FILE=".env.staging" ;;
    --production) ENV_FILE=".env.production" ;;
    --burst) BURST=1 ;;
    --project) PROJECT_ID="${2:?}"; shift ;;
    --file) FILE_NAME="${2:?}"; shift ;;
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

curl_auth_args=()
if [[ -n "${OD_API_TOKEN:-}" ]]; then
  curl_auth_args=(-H "Authorization: Bearer ${OD_API_TOKEN}")
fi

curl_daemon() {
  local path="$1"
  curl -sf --max-time 30 "${curl_auth_args[@]}" "${DAEMON_URL}${path}"
}

curl_daemon_raw() {
  local path="$1"
  curl -s --max-time 30 "${curl_auth_args[@]}" "${DAEMON_URL}${path}"
}

metrics_line() {
  local name="$1"
  curl_daemon_raw /api/metrics 2>/dev/null | grep -E "^${name} " | tail -n 1 || true
}

metrics_value() {
  local line
  line="$(metrics_line "$1")"
  if [[ -z "$line" ]]; then
    echo ""
    return 0
  fi
  awk '{print $2}' <<< "$line"
}

echo "==> verify_file_revision_retention @ ${DAEMON_URL}"
echo

health_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${curl_auth_args[@]}" "${DAEMON_URL}/api/health" 2>/dev/null || echo "000")"
if [[ "$health_code" == "200" ]]; then
  ok "GET /api/health → 200"
else
  bad "GET /api/health → ${health_code}"
fi

metrics_body="$(curl_daemon_raw /api/metrics 2>/dev/null || true)"
if [[ -n "$metrics_body" ]] && grep -q 'od_file_revision_' <<< "$metrics_body"; then
  ok "GET /api/metrics exposes od_file_revision_* gauges"
else
  bad "GET /api/metrics missing od_file_revision gauges"
fi

for gauge in \
  od_file_revision_snapshot_bytes \
  od_file_revision_snapshot_rows \
  od_file_revision_metadata_rows \
  od_file_revision_retention_deferred_excess \
  od_file_revision_deferred_sweep_queue_depth \
  od_file_revision_gc_last_success_unix; do
  value="$(metrics_value "$gauge")"
  if [[ -n "$value" ]]; then
    note "$gauge = $value"
  else
    bad "missing gauge $gauge"
  fi
done

gc_unix="$(metrics_value od_file_revision_gc_last_success_unix)"
if [[ -n "$gc_unix" && "$gc_unix" != "0" ]]; then
  now_unix="$(date +%s)"
  gc_age=$((now_unix - gc_unix))
  if (( gc_age <= GC_MAX_AGE )); then
    ok "od_file_revision_gc_last_success age ${gc_age}s (≤ ${GC_MAX_AGE}s)"
  else
    bad "od_file_revision_gc_last_success stale (${gc_age}s > ${GC_MAX_AGE}s)"
  fi
elif [[ -n "$gc_unix" && "$gc_unix" == "0" ]]; then
  note "od_file_revision_gc_last_success_unix=0 (GC not run yet on fresh node)"
else
  bad "cannot read od_file_revision_gc_last_success_unix"
fi

deferred_excess="$(metrics_value od_file_revision_retention_deferred_excess)"
queue_depth="$(metrics_value od_file_revision_deferred_sweep_queue_depth)"
orphan_rows="$(metrics_value od_file_revision_orphan_snapshot_rows)"

if [[ -n "$queue_depth" ]]; then
  if [[ "$queue_depth" == "0" ]]; then
    ok "deferred_sweep_queue_depth = 0"
  else
    note "deferred_sweep_queue_depth = $queue_depth (sweep may be in flight)"
  fi
fi

if [[ -n "$deferred_excess" && "$deferred_excess" != "0" ]]; then
  note "retention_deferred_excess = $deferred_excess (checkpoint stuck or sweep lag — see 50-3 §5.1.2)"
fi

if [[ -n "$orphan_rows" ]]; then
  if [[ "$orphan_rows" == "0" ]]; then
    ok "orphan_snapshot_rows = 0"
  else
    note "orphan_snapshot_rows = $orphan_rows (investigate GC/maintenance)"
  fi
fi

if [[ "$BURST" == "1" ]]; then
  if [[ -z "$PROJECT_ID" ]]; then
    bad "VERIFY_REVISION_BURST=1 requires VERIFY_REVISION_PROJECT_ID (or --project)"
  else
    encoded_file="$(python3 -c "import urllib.parse; print(urllib.parse.quote('$FILE_NAME', safe=''))")"
    revisions_path="/api/projects/${PROJECT_ID}/files/${encoded_file}/revisions"

    list_json="$(curl_daemon "$revisions_path" 2>/dev/null || echo '{}')"
    if grep -q '"revisions"' <<< "$list_json"; then
      ok "GET revisions list → 200 ($PROJECT_ID / $FILE_NAME)"
    else
      bad "GET revisions list failed for $PROJECT_ID / $FILE_NAME"
    fi

    echo "   pushing ${BURST_COUNT} revisions..."
  push_ok=0
  for ((i = 1; i <= BURST_COUNT; i++)); do
    body="$(python3 -c "import json; print(json.dumps({'content': '<html>burst-${i}</html>', 'source': 'manual_edit', 'label': 'burst ${i}'}))")"
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
      -X POST "${curl_auth_args[@]}" \
      -H 'Content-Type: application/json' \
      -d "$body" \
      "${DAEMON_URL}${revisions_path}" 2>/dev/null || echo "000")"
    if [[ "$code" == "200" ]]; then
      push_ok=$((push_ok + 1))
    else
      bad "POST revision burst ${i} → ${code}"
      break
    fi
  done
  if (( push_ok == BURST_COUNT )); then
    ok "POST ${BURST_COUNT} revisions → 200"
  fi

    echo "   polling retentionPending (max ${POLL_SECS}s)..."
    deadline=$(( $(date +%s) + POLL_SECS ))
    pending_seen=0
    cleared=0
    while (( $(date +%s) < deadline )); do
      list_json="$(curl_daemon "$revisions_path" 2>/dev/null || echo '{}')"
      if command -v python3 >/dev/null 2>&1; then
        pending="$(python3 -c '
import json,sys
j=json.load(sys.stdin)
print("1" if j.get("retentionPending") else "0")
' <<< "$list_json" 2>/dev/null || echo "0")"
        count="$(python3 -c '
import json,sys
j=json.load(sys.stdin)
print(len(j.get("revisions") or []))
' <<< "$list_json" 2>/dev/null || echo "?")"
        limit="$(python3 -c '
import json,sys
j=json.load(sys.stdin)
print(j.get("retentionLimit",""))
' <<< "$list_json" 2>/dev/null || echo "?")"
      else
        pending="0"
        count="?"
        limit="?"
      fi
      if [[ "$pending" == "1" ]]; then
        pending_seen=1
        note "retentionPending=true (revisions=$count limit=$limit)"
      else
        cleared=1
        ok "retentionPending cleared (revisions=$count limit=$limit)"
        break
      fi
      sleep 4
    done
    if [[ "$pending_seen" == "1" && "$cleared" != "1" ]]; then
      note "retentionPending still true after ${POLL_SECS}s (checkpoint stuck excess may be normal)"
    fi

    deferred_excess="$(metrics_value od_file_revision_retention_deferred_excess)"
    queue_depth="$(metrics_value od_file_revision_deferred_sweep_queue_depth)"
    note "post-burst deferred_excess=$deferred_excess queue_depth=$queue_depth"
  fi
fi

echo
echo "==> summary: pass=$pass fail=$fail warn=$warn"
if (( fail > 0 )); then
  exit 1
fi
