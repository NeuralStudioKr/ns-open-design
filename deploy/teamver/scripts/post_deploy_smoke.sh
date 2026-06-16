#!/usr/bin/env bash
# Post-deploy verification for Teamver Design staging/prod (curl smoke + optional M2M).
#
# Usage:
#   bash scripts/post_deploy_smoke.sh --staging
#   TEAMVER_COOKIE='...' TEAMVER_INTERNAL_API_KEY='...' bash scripts/post_deploy_smoke.sh --staging
#
# On the EC2 host (loopback M2M after nginx hardening):
#   DESIGN_API_LOCAL_URL=http://127.0.0.1:16000 \
#     TEAMVER_INTERNAL_API_KEY='...' \
#     bash scripts/post_deploy_smoke.sh --staging

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$ROOT/scripts/smoke_design.sh" "$@"
