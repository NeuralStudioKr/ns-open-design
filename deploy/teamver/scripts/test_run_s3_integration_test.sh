#!/usr/bin/env bash
# Fixture checks for run_s3_integration_test.sh (P1-9 MinIO harness wrapper).
#
# Verifies the script's args/--skip-if-no-docker behavior WITHOUT spinning
# up MinIO. We can't exercise the live MinIO + vitest path here (would
# require docker + the daemon workspace), but we can lock the no-docker
# skip semantics so a missing-docker environment never breaks CI/ops.
#
# Usage: bash deploy/teamver/scripts/test_run_s3_integration_test.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/run_s3_integration_test.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "❌ missing $SCRIPT"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Shim a PATH where docker does NOT resolve, so we exercise the
# `command -v docker` branch deterministically. The script's --skip-if-no-docker
# must exit 0 with a clear "skip" message.
mkdir -p "$WORK/bin"

# Build a minimal PATH where docker does NOT resolve. We deliberately use
# just /usr/bin:/bin (Docker Desktop / Homebrew live elsewhere) so the
# script's `command -v docker` fails deterministically. Verify here that
# docker really isn't in this path — otherwise the test is meaningless.
SAFE_PATH="$WORK/bin:/usr/bin:/bin"
if PATH="$SAFE_PATH" command -v docker >/dev/null 2>&1; then
  echo "○ skip: docker is installed under /usr/bin or /bin; cannot exercise no-docker branch"
  exit 0
fi

out="$(PATH="$SAFE_PATH" bash "$SCRIPT" --skip-if-no-docker 2>&1)"
rc=$?
if [[ $rc -ne 0 ]]; then
  echo "❌ --skip-if-no-docker expected exit 0, got $rc"
  echo "$out"
  exit 1
fi
if ! grep -q 'skip S3 integration' <<< "$out"; then
  echo "❌ --skip-if-no-docker missing skip message"
  echo "$out"
  exit 1
fi

# Without --skip-if-no-docker and no docker, the script must fail clearly.
if PATH="$SAFE_PATH" bash "$SCRIPT" >/dev/null 2>&1; then
  echo "❌ expected failure when docker missing without --skip-if-no-docker"
  exit 1
fi

# The script should reference the expected vitest target file in its body, so
# we don't accidentally rename / drop the harness.
if ! grep -q 'tests/s3-project-storage.integration.test.ts' "$SCRIPT"; then
  echo "❌ run_s3_integration_test.sh no longer references the integration test path"
  exit 1
fi

# Default bucket / port / creds must remain stable across edits (smoke
# script + EC2 runbook references these names directly).
for needle in \
  'MINIO_PORT="${MINIO_PORT:-19000}"' \
  'BUCKET="${OD_S3_TEST_BUCKET:-teamver-design-test}"' \
  'OD_S3_TEST_ACCESS_KEY_ID="$ACCESS_KEY"' \
  'OD_S3_TEST_SECRET_ACCESS_KEY="$SECRET_KEY"' \
  'OD_S3_TEST_PREFIX="integration/"'
do
  if ! grep -qF "$needle" "$SCRIPT"; then
    echo "❌ run_s3_integration_test.sh missing expected default: $needle"
    exit 1
  fi
done

echo "✓ run_s3_integration_test fixture ok"
