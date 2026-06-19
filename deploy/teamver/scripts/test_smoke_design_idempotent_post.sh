#!/usr/bin/env bash
# Fixture — smoke_design.sh must include the POST /api/v1/projects idempotent
# regression probe (registered od_project_id → 200, not 409). The probe runs
# only when TEAMVER_COOKIE + TEAMVER_WORKSPACE_ID + a discoverable
# odProjectId are present, so a runtime exercise needs a real staging
# session. We pin the source instead so a future hand can't quietly drop
# the probe and lose the staging guard that caught
# `409 project_already_registered` re-exposure.
#
# Usage: bash deploy/teamver/scripts/test_smoke_design_idempotent_post.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/smoke_design.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "❌ missing $SCRIPT"
  exit 1
fi

required=(
  # Probe is gated by access_project_id resolved earlier in the same block
  # so the same fixture catches accidental moves outside the cookie path.
  'idempotent_post_code'
  '${API_BASE}/api/v1/projects"'
  'odProjectId'
  'design-api POST /projects (duplicate id, cookie) → 200 idempotent'
  'registry upsert regression — redeploy design-api'
)

missing=0
for pattern in "${required[@]}"; do
  if ! grep -q -F "$pattern" "$SCRIPT"; then
    echo "❌ smoke_design.sh missing idempotent POST probe line: $pattern"
    missing=$((missing + 1))
  fi
done

if (( missing > 0 )); then
  echo "→ Re-add the duplicate-odProjectId POST probe to smoke_design.sh"
  echo "  (see fix(design-api): make POST /projects registry upsert idempotent)"
  exit 1
fi

echo "✓ smoke_design idempotent POST regression probe present"
