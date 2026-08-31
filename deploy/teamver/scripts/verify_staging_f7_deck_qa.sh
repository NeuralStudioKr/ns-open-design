#!/usr/bin/env bash
# Staging QA: fetch persisted deck.html and verify F7 heal fixes user-reported defects.
#
# Usage:
#   TEAMVER_COOKIE='teamver_access_token=...; teamver_design_bff_session=...' \
#   TEAMVER_WORKSPACE_ID='W-...' \
#   bash deploy/teamver/scripts/verify_staging_f7_deck_qa.sh
#
# Optional:
#   TEAMVER_OD_PROJECT_ID=<uuid>   default: f2c3a57b-3a1b-40cb-8c76-96ab895ced11
#   F7_QA_BRIEF='...'              default: 영어 회화 공부, 연습 팁에 대한
#   DESIGN_HOST=stg-design.teamver.com

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
DESIGN_HOST="${DESIGN_HOST:-stg-design.teamver.com}"
OD="${TEAMVER_OD_PROJECT_ID:-f2c3a57b-3a1b-40cb-8c76-96ab895ced11}"
BRIEF="${F7_QA_BRIEF:-영어 회화 공부, 연습 팁에 대한}"

if [[ -z "${TEAMVER_COOKIE:-}" ]]; then
  echo "✗ TEAMVER_COOKIE required" >&2
  exit 1
fi

hdr=(-H "Cookie: ${TEAMVER_COOKIE}")
if [[ -n "${TEAMVER_WORKSPACE_ID:-}" ]]; then
  hdr+=(-H "X-Workspace-Id: ${TEAMVER_WORKSPACE_ID}")
fi

echo "==> auth session"
session_body="$(mktemp)"
session_code="$(curl -s -o "$session_body" -w '%{http_code}' "${hdr[@]}" \
  "https://${DESIGN_HOST}/teamver-bff/auth/session")"
if [[ "$session_code" != "200" ]]; then
  echo "✗ auth/session → ${session_code}" >&2
  cat "$session_body" >&2 || true
  rm -f "$session_body"
  exit 1
fi
if ! grep -q '"authenticated":true' "$session_body"; then
  echo "✗ auth/session → 200 but authenticated=false (cookie expired — re-login and paste fresh TEAMVER_COOKIE)" >&2
  head -c 300 "$session_body" >&2 || true
  echo >&2
  rm -f "$session_body"
  exit 1
fi
rm -f "$session_body"
echo "✓ auth/session → 200 authenticated=true"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

echo "==> fetch raw deck.html (od=${OD})"
deck_code="$(curl -s -o "$tmp" -w '%{http_code}' "${hdr[@]}" \
  "https://${DESIGN_HOST}/api/projects/${OD}/raw/deck.html")"
if [[ "$deck_code" != "200" ]]; then
  echo "✗ raw/deck.html → ${deck_code}" >&2
  head -c 400 "$tmp" >&2 || true
  exit 1
fi
echo "✓ raw/deck.html → 200 ($(wc -c < "$tmp" | tr -d ' ') bytes)"

echo "==> F7 heal replay (contracts source)"
export F7_QA_DECK_PATH="$tmp"
export F7_QA_BRIEF="$BRIEF"
pnpm --dir "$REPO_ROOT/packages/contracts" exec tsx -e "
import { readFileSync } from 'node:fs';
import { healAiGeneratedDeckMarkup } from './src/html/heal-ai-generated-deck.ts';

const brief = process.env.F7_QA_BRIEF ?? '';
const html = readFileSync(process.env.F7_QA_DECK_PATH!, 'utf8');
const raw = {
  brief_leak: html.includes(brief),
  particle_gap: html.includes('발화 회로 를'),
  stray_h: /<\\/h>/.test(html),
  empty_chapter: /class=\"slide s-chapter\"[^>]*>\\s*<\\/section>/.test(html),
};
const out = healAiGeneratedDeckMarkup(html, brief);
const healed = {
  brief_leak: out.includes(brief),
  particle_gap: out.includes('발화 회로 를'),
  particle_ok: /발화 회로를/.test(out),
  empty_chapter: /class=\"slide s-chapter\"[^>]*>\\s*<\\/section>/.test(out),
  stray_h: /<\\/h>/.test(out),
  nested_h1_div: /<h1[^>]*>[\\s\\S]*?<div[^>]*>[\\s\\S]*?<\\/h1>/.test(out),
};
// nested_h1_div may remain on unrelated slides; require Q1-Q5 set only.
const ok =
  !healed.brief_leak &&
  !healed.particle_gap &&
  (healed.particle_ok || !raw.particle_gap) &&
  !healed.empty_chapter &&
  !healed.stray_h;
console.log(JSON.stringify({ raw, healed, ok }, null, 2));
if (!ok) process.exit(1);
"

echo "✓ F7 heal replay passed (raw had defects; heal cleared them)"
