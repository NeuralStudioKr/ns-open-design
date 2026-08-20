#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "$0")/../lib.sh"

ci_gate_timed_step "web-build-sidecar" pnpm --filter @open-design/web build:sidecar
# Tip remount smoke pin (506) — fail-fast before full web vitest.
ci_gate_timed_step "web-tip-remount-smoke" pnpm --filter @open-design/web test:tip-remount-smoke
ci_gate_timed_step "web-test" pnpm --filter @open-design/web test
