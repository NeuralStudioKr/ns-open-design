#!/usr/bin/env bash
# MiniMax staging canary smoke — curl + operator checklist (no browser).
#
# Usage:
#   TEAMVER_COOKIE='teamver_access_token=...' \
#   TEAMVER_WORKSPACE_ID='...' \
#   bash deploy/teamver/scripts/smoke_minimax_staging.sh
#
# Optional daemon loopback (VM/SSH on staging host):
#   DESIGN_DAEMON_LOCAL_URL=http://127.0.0.1:7456 \
#   TEAMVER_COOKIE='...' bash deploy/teamver/scripts/smoke_minimax_staging.sh
#
# Env:
#   SMOKE_EXPECT_MINIMAX=1 (default) — runtime-config must report apiProtocol=minimax
#   SMOKE_REQUIRE_MANAGED_API=1 (default) — configured=true required
#   SMOKE_MINIMAX_CONNECTION=1 (optional) — POST /api/test/connection on daemon loopback

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_EXPECT_MINIMAX="${SMOKE_EXPECT_MINIMAX:-1}"
export SMOKE_EXPECT_MINIMAX
SMOKE_REQUIRE_MANAGED_API="${SMOKE_REQUIRE_MANAGED_API:-1}"
export SMOKE_REQUIRE_MANAGED_API

echo "==> MiniMax staging canary (wraps smoke_design.sh)"
echo "    Expect runtime-config apiProtocol=minimax"
echo

bash "$ROOT/scripts/smoke_design.sh" --staging

pass=0
fail=0

daemon_base="${DESIGN_DAEMON_LOCAL_URL:-}"
if [[ -n "$daemon_base" && "${SMOKE_MINIMAX_CONNECTION:-0}" == "1" ]]; then
  echo
  echo "==> MiniMax daemon connection smoke (loopback)"
  conn_body="$(mktemp)"
  conn_code="$(curl -s -o "$conn_body" -w '%{http_code}' --max-time 30 \
    -X POST \
    -H 'Content-Type: application/json' \
    -d '{"protocol":"minimax","useManagedApiKey":true,"model":"MiniMax-M3"}' \
    "${daemon_base%/}/api/test/connection" 2>/dev/null || echo "000")"
  if [[ "$conn_code" == "200" ]]; then
    if grep -q '"ok"[[:space:]]*:[[:space:]]*true' "$conn_body" 2>/dev/null; then
      echo "✓ daemon /api/test/connection minimax ok=true"
      pass=$((pass + 1))
    else
      echo "✗ daemon /api/test/connection minimax returned 200 but ok!=true"
      cat "$conn_body" >&2 || true
      fail=$((fail + 1))
    fi
    if grep -Eiq 'sk-cp-|apiKey|authorization' "$conn_body"; then
      echo "✗ daemon connection response may leak key material"
      fail=$((fail + 1))
    else
      echo "✓ daemon connection response has no key material"
      pass=$((pass + 1))
    fi
  else
    echo "✗ daemon /api/test/connection minimax → ${conn_code} (expected 200)"
    cat "$conn_body" >&2 || true
    fail=$((fail + 1))
  fi
  rm -f "$conn_body"
else
  echo
  echo "○ skip daemon /api/test/connection (set DESIGN_DAEMON_LOCAL_URL + SMOKE_MINIMAX_CONNECTION=1)"
fi

echo
echo "==> Browser QA checklist (manual — required before production default switch)"
cat <<'EOF'
  1. 새 프로젝트 → deck artifact type=deck (not html), 미리보기 자동 표시
  2. "www.teamver.com 참고해서 발표자료 만들어줘" → web_fetch 호출, SSRF 차단(private/localhost)
  3. 기존 deck 텍스트/폰트 수정 → S3/DB 저장, reload 후 유지
  4. 댓글 scoped patch → 선택 영역 밖 변경 감지, 실패 시 assistant message 에러 카드
  5. 로컬/Drive 파일 첨부 생성
  6. 작업 중 이탈/재진입/중지 → streaming/checkpoint 유실 없음
  7. hidden block 미노출: <question, <artifact, <invoke>, <tools>, Deliverable instruction, deck nav JS tail
  8. Network 탭에 MiniMax API key 미노출
EOF

echo
if [[ "$fail" -gt 0 ]]; then
  echo "MiniMax canary extras: ${pass} passed, ${fail} failed"
  exit 1
fi
echo "MiniMax canary extras: ${pass} passed (manual browser QA still required)"
exit 0
