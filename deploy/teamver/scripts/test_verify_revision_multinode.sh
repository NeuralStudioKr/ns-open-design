#!/usr/bin/env bash
# Fixture — verify_revision_multinode.sh --help and required-arg guard.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/verify_revision_multinode.sh"

if ! bash "$SCRIPT" --help | grep -q 'verify_revision_multinode'; then
  echo "❌ --help missing title"
  exit 1
fi

if bash "$SCRIPT" --staging 2>/dev/null; then
  echo "❌ expected failure without project-id"
  exit 1
fi

echo "✓ verify_revision_multinode fixture ok"
