#!/usr/bin/env bash
# Track A staging E2E helper — smoke + manual checklist for ops (U-6, D-5, S-8).
#
# Usage (on laptop with VPN / from EC2):
#   bash scripts/run_staging_track_a_e2e.sh
#   TEAMVER_COOKIE='teamver_access_token=...' \
#   TEAMVER_WORKSPACE_ID='WS-...' \
#   TEAMVER_INTERNAL_API_KEY='...' \
#   DESIGN_API_LOCAL_URL=http://127.0.0.1:16000 \
#     bash scripts/run_staging_track_a_e2e.sh
#
# On EC2 host, loopback M2M after nginx hardening:
#   DESIGN_API_LOCAL_URL=http://127.0.0.1:16000 TEAMVER_INTERNAL_API_KEY=... \
#     bash scripts/run_staging_track_a_e2e.sh --smoke-only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --smoke-only) SMOKE_ONLY=1 ;;
    -h|--help)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

echo "==> Phase 1: automated smoke (curl)"
if ! bash "$ROOT/scripts/post_deploy_smoke.sh" --staging; then
  echo
  echo "❌ smoke failed — fix connectivity (VPN/EC2) or deployment before manual E2E."
  exit 1
fi

if [[ "$SMOKE_ONLY" -eq 1 ]]; then
  exit 0
fi

cat <<'EOF'

==> Phase 2: manual browser E2E (staging)

Session (10 §6 S-8):
  [ ] stg-design.teamver.com — login, embed loads, no GitHub/Discord links
  [ ] Expired cookie → 401 banner → refresh or re-login
  [ ] Settings/runtime-config shows managed API (TEAMVER_OD_API_KEY on server)

Usage (11 §8 U-6):
  [ ] embed run 완료 → design-api POST /api/internal/usage/events 204 (daemon M2M)
  [ ] Main BE ai_model_token_usages row for workspace + run_id
  [ ] GET /api/token-usage/by-model?app=design returns the run

Drive Publish (11 §8 D-5):
  [ ] embed FileViewer → Publish to Drive (HTML)
  [ ] design_outputs row + drive_asset_id
  [ ] Toast "Drive에서 보기" → Main FE /drive?asset=AST-… opens detail modal
  [ ] formats html+zip partial fail → 207, ready output still usable

S3 (09 P1-8, if OD_PROJECT_STORAGE=s3):
  [ ] New project → registry s3_prefix header on /access
  [ ] Publish reads export/manifest after lazy sync-down

Optional env for richer smoke on next run:
  TEAMVER_COOKIE, TEAMVER_WORKSPACE_ID, TEAMVER_INTERNAL_API_KEY
  DESIGN_API_LOCAL_URL=http://127.0.0.1:16000  (on EC2 for M2M internal path)

Docs: docs-teamver/10_세션·OD패치_보강.md §6, 11_Usage·Drive_Publish_보강.md §8
EOF
