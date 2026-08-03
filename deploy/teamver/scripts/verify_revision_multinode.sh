#!/usr/bin/env bash
# Teamver Design — 2-pod file revision cross-node verification (50-4 §8).
#
# Compares revision LIST (Postgres SSOT) across local loopback and optional peer
# daemon. Optionally checks raw deck.html byte size per node (scratch — may
# differ until S3/lazy sync).
#
# Run on Design EC2 over SSH. Uses python3 (no jq).
#
# Usage:
#   cd deploy/teamver
#   bash scripts/verify_revision_multinode.sh --staging \
#     --project-id <uuid> --file deck.html \
#     --user-id <X-Teamver-User-Id> --workspace-id <X-Teamver-Workspace-Id> \
#     --peer-url http://10.10.101.198:7456

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DAEMON_URL="${VERIFY_REVISION_DAEMON_URL:-http://127.0.0.1:7456}"
PEER_URL=""
ENV_FILE=""
PROJECT_ID="${VERIFY_REVISION_PROJECT_ID:-}"
FILE_NAME="${VERIFY_REVISION_FILE:-deck.html}"
TEAMVER_USER_ID="${TEAMVER_USER_ID:-}"
TEAMVER_WORKSPACE_ID="${TEAMVER_WORKSPACE_ID:-}"
DO_RAW=0
RESTORE_ID=""

usage() {
  cat <<'EOF'
verify_revision_multinode.sh — 2-pod revision list (R1) + optional raw/restore

  bash scripts/verify_revision_multinode.sh --staging \
    --project-id <uuid> --file deck.html \
    --user-id <id> --workspace-id <ws-id> \
    --peer-url http://<peer-private-ip>:7456

Required:
  --project-id, --user-id, --workspace-id  (or env TEAMVER_* / VERIFY_REVISION_PROJECT_ID)

Options:
  --staging | --production   load OD_API_TOKEN from .env.*
  --daemon-url URL           local daemon (default http://127.0.0.1:7456)
  --peer-url URL             peer for R1 list compare
  --raw                      raw/<file> byte length (local + peer)
  --restore REVISION_ID      POST restore on local node only

See docs-teamver/50-4_revision_staging_머지_배포_검증.md §8.0 (list vs scratch vs UI cursor).
EOF
}

while (( $# )); do
  case "$1" in
    --staging) ENV_FILE=".env.staging" ;;
    --production) ENV_FILE=".env.production" ;;
    --daemon-url) DAEMON_URL="${2:?}"; shift ;;
    --peer-url) PEER_URL="${2:?}"; shift ;;
    --project-id) PROJECT_ID="${2:?}"; shift ;;
    --file) FILE_NAME="${2:?}"; shift ;;
    --user-id) TEAMVER_USER_ID="${2:?}"; shift ;;
    --workspace-id) TEAMVER_WORKSPACE_ID="${2:?}"; shift ;;
    --raw) DO_RAW=1 ;;
    --restore) RESTORE_ID="${2:?}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1" >&2; usage; exit 1 ;;
  esac
  shift
done

DAEMON_URL="${DAEMON_URL%/}"
PEER_URL="${PEER_URL%/}"

if [[ -n "$ENV_FILE" && -f "$ROOT/$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ROOT/$ENV_FILE"
  set +a
fi

if [[ -z "$PROJECT_ID" || -z "$TEAMVER_USER_ID" || -z "$TEAMVER_WORKSPACE_ID" ]]; then
  echo "❌ --project-id, --user-id, --workspace-id required" >&2
  usage
  exit 1
fi

if [[ -z "${OD_API_TOKEN:-}" ]]; then
  echo "❌ OD_API_TOKEN unset (use --staging or export OD_API_TOKEN)" >&2
  exit 1
fi

pass=0
fail=0

ok() { echo "✓ $1"; pass=$((pass + 1)); }
bad() { echo "✗ $1"; fail=$((fail + 1)); }
note() { echo "○ $1"; }

ENCODED_FILE="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$FILE_NAME")"
REVISIONS_PATH="/api/projects/${PROJECT_ID}/files/${ENCODED_FILE}/revisions"

AUTH_HEADERS=(
  -H "Authorization: Bearer ${OD_API_TOKEN}"
  -H "X-Teamver-User-Id: ${TEAMVER_USER_ID}"
  -H "X-Teamver-Workspace-Id: ${TEAMVER_WORKSPACE_ID}"
)

daemon_request() {
  local base="$1"
  local path="$2"
  local method="${3:-GET}"
  local body_file="${4:-}"
  local out
  out="$(mktemp)"
  local curl_args=(
    -sS -o "$out" -w '%{http_code}'
    --max-time 30
    -X "$method"
    "${AUTH_HEADERS[@]}"
  )
  if [[ -n "$body_file" ]]; then
    curl_args+=(-H "Content-Type: application/json" -d "@${body_file}")
  fi
  local code
  code="$(curl "${curl_args[@]}" "${base}${path}" 2>/dev/null || echo "000")"
  echo "$code" "$out"
}

fetch_health_node() {
  local base="$1"
  local read code tmp
  read -r code tmp < <(daemon_request "$base" "/api/health")
  if [[ "$code" != "200" ]]; then
    echo "?"
    rm -f "$tmp"
    return
  fi
  python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('nodeId','?'))" "$tmp"
  rm -f "$tmp"
}

summarize_list() {
  local json_file="$1"
  python3 - "$json_file" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
if "detail" in data and "revisions" not in data:
    print("ERROR\t" + str(data.get("detail", data)))
    raise SystemExit(2)
revs = data.get("revisions") or []
head = data.get("headRevisionId") or ""
ret = data.get("retentionLimit", "")
pairs = ",".join(f"{r.get('sequence')}:{r.get('id')}" for r in revs)
print(f"HEAD\t{head}")
print(f"COUNT\t{len(revs)}")
print(f"RETENTION\t{ret}")
print(f"PAIRS\t{pairs}")
PY
}

raw_byte_count() {
  local base="$1"
  local read code tmp
  read -r code tmp < <(daemon_request "$base" "/api/projects/${PROJECT_ID}/raw/${ENCODED_FILE}")
  if [[ "$code" != "200" ]]; then
    echo "HTTP_${code}"
    rm -f "$tmp"
    return
  fi
  wc -c < "$tmp" | tr -d ' \n'
  rm -f "$tmp"
}

echo "==> verify_revision_multinode"
echo "    project=$PROJECT_ID  file=$FILE_NAME"
echo "    local=$DAEMON_URL"
[[ -n "$PEER_URL" ]] && echo "    peer=$PEER_URL"
echo

local_node="$(fetch_health_node "$DAEMON_URL")"
if [[ "$local_node" == "?" ]]; then
  bad "local GET /api/health"
else
  ok "local nodeId=$local_node"
fi

if [[ -n "$PEER_URL" ]]; then
  peer_node="$(fetch_health_node "$PEER_URL")"
  if [[ "$peer_node" == "?" ]]; then
    bad "peer GET /api/health ($PEER_URL)"
  else
    ok "peer nodeId=$peer_node"
  fi
fi

read -r local_code local_json < <(daemon_request "$DAEMON_URL" "$REVISIONS_PATH")
if [[ "$local_code" != "200" ]]; then
  bad "local GET revisions → HTTP $local_code"
  head -c 500 "$local_json" 2>/dev/null; echo
  rm -f "$local_json"
  exit 1
fi
ok "local GET revisions → 200"

local_summary="$(mktemp)"
if ! summarize_list "$local_json" > "$local_summary" 2>/dev/null; then
  bad "local revisions JSON parse failed"
  cat "$local_json"
  rm -f "$local_json" "$local_summary"
  exit 1
fi

local_head="$(awk -F'\t' '$1=="HEAD"{print $2}' "$local_summary")"
local_count="$(awk -F'\t' '$1=="COUNT"{print $2}' "$local_summary")"
local_pairs="$(awk -F'\t' '$1=="PAIRS"{print $2}' "$local_summary")"
note "local head=$local_head count=$local_count"

peer_summary=""
if [[ -n "$PEER_URL" ]]; then
  read -r peer_code peer_json < <(daemon_request "$PEER_URL" "$REVISIONS_PATH")
  if [[ "$peer_code" != "200" ]]; then
    bad "peer GET revisions → HTTP $peer_code"
    head -c 500 "$peer_json" 2>/dev/null; echo
    rm -f "$local_json" "$peer_json" "$local_summary"
    exit 1
  fi
  ok "peer GET revisions → 200"
  peer_summary="$(mktemp)"
  if ! summarize_list "$peer_json" > "$peer_summary" 2>/dev/null; then
    bad "peer revisions JSON parse failed"
    rm -f "$local_json" "$peer_json" "$local_summary" "$peer_summary"
    exit 1
  fi
  peer_head="$(awk -F'\t' '$1=="HEAD"{print $2}' "$peer_summary")"
  peer_count="$(awk -F'\t' '$1=="COUNT"{print $2}' "$peer_summary")"
  peer_pairs="$(awk -F'\t' '$1=="PAIRS"{print $2}' "$peer_summary")"
  note "peer head=$peer_head count=$peer_count"

  if [[ "$local_head" == "$peer_head" && "$local_count" == "$peer_count" && "$local_pairs" == "$peer_pairs" ]]; then
    ok "R1: local and peer revision list match (Postgres SSOT)"
  else
    bad "R1: local vs peer mismatch"
    echo "    local: head=$local_head count=$local_count"
    echo "    peer:  head=$peer_head count=$peer_count"
  fi
  rm -f "$peer_json" "$peer_summary"
fi

if [[ -n "$RESTORE_ID" ]]; then
  echo
  echo "==> restore on local node ($local_node)"
  restore_path="${REVISIONS_PATH}/$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$RESTORE_ID")/restore"
  read -r restore_code restore_json < <(daemon_request "$DAEMON_URL" "$restore_path" POST)
  if [[ "$restore_code" != "200" ]]; then
    bad "local POST restore → HTTP $restore_code"
    head -c 500 "$restore_json" 2>/dev/null; echo
  else
    ok "local POST restore → 200 (disk on this node updated; headRevisionId unchanged)"
    note "refresh browser if X-OD-Node-Id matches $local_node"
  fi
  rm -f "$restore_json"
fi

if [[ "$DO_RAW" -eq 1 ]]; then
  echo
  echo "==> raw byte check (per-node scratch — may differ)"
  local_raw="$(raw_byte_count "$DAEMON_URL")"
  note "local raw bytes=$local_raw"
  if [[ -n "$PEER_URL" ]]; then
    peer_raw="$(raw_byte_count "$PEER_URL")"
    note "peer raw bytes=$peer_raw"
    if [[ "$local_raw" == "$peer_raw" ]]; then
      ok "raw bytes match on both nodes"
    else
      note "raw bytes differ (expected if restore ran on one node only; wait for S3 sync or restore on browser node)"
    fi
  fi
fi

rm -f "$local_json" "$local_summary"

echo
echo "==> summary: pass=$pass fail=$fail"
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
echo "✓ revision multinode checks OK"
exit 0
