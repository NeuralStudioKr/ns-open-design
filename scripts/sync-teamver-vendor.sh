#!/usr/bin/env bash
# Build Teamver SDK artifacts in ns-teamver-platform and copy into vendor/teamver/.
#
# Uses platform scripts (no npm/PyPI registry):
#   ns-teamver-platform/scripts/build-ts-packages.sh
#   ns-teamver-platform/scripts/build-python-sdk.sh
#
# Usage (ns-open-design repo root):
#   bash scripts/sync-teamver-vendor.sh
#
# Override platform location:
#   TEAMVER_PLATFORM_ROOT=/path/to/ns-teamver-platform bash scripts/sync-teamver-vendor.sh
set -euo pipefail

OD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLATFORM_ROOT="${TEAMVER_PLATFORM_ROOT:-$(cd "$OD_ROOT/../ns-teamver-platform" && pwd)}"
VENDOR="$OD_ROOT/vendor/teamver"
APP_SDK_PKG="$PLATFORM_ROOT/packages/typescript/app-sdk"
PYTHON_PKG="$PLATFORM_ROOT/packages/python/teamver-app-sdk-python"

if [[ ! -f "$PLATFORM_ROOT/scripts/build-ts-packages.sh" ]]; then
  echo "❌ ns-teamver-platform not found at: $PLATFORM_ROOT" >&2
  echo "   Set TEAMVER_PLATFORM_ROOT or clone sibling repo." >&2
  exit 1
fi

mkdir -p "$VENDOR/python"

echo "==> build-ts-packages (@teamver/app-sdk, @teamver/drive-ui)"
FORCE_TS_BUILD=1 bash "$PLATFORM_ROOT/scripts/build-ts-packages.sh"

SDK_VERSION="$(node -p "require('$APP_SDK_PKG/package.json').version")"
echo "==> npm pack @teamver/app-sdk@$SDK_VERSION"
rm -f "$VENDOR/app-sdk.tgz" "$VENDOR"/teamver-app-sdk-*.tgz
(
  cd "$APP_SDK_PKG"
  npm pack --pack-destination "$VENDOR" --silent
)
PACKED="$VENDOR/teamver-app-sdk-${SDK_VERSION}.tgz"
if [[ ! -f "$PACKED" ]]; then
  echo "❌ npm pack failed — expected $PACKED" >&2
  exit 1
fi
mv "$PACKED" "$VENDOR/app-sdk.tgz"

echo "==> build-python-sdk (teamver-app-sdk wheel)"
if ! bash "$PLATFORM_ROOT/scripts/build-python-sdk.sh"; then
  echo "==> Python venv required — running setup-python-venv.sh"
  bash "$PLATFORM_ROOT/scripts/setup-python-venv.sh"
  bash "$PLATFORM_ROOT/scripts/build-python-sdk.sh"
fi

WHEEL="$(ls -1 "$PYTHON_PKG/dist"/teamver_app_sdk-*.whl 2>/dev/null | head -1 || true)"
if [[ -z "$WHEEL" || ! -f "$WHEEL" ]]; then
  echo "❌ Python wheel not found under $PYTHON_PKG/dist" >&2
  exit 1
fi
PY_VERSION="$(basename "$WHEEL" | sed -E 's/^teamver_app_sdk-(.+)-py3-none-any\.whl$/\1/')"
WHEEL_BASENAME="$(basename "$WHEEL")"
rm -f "$VENDOR/python/"*.whl "$VENDOR/python/teamver-app-sdk.whl"
cp "$WHEEL" "$VENDOR/python/$WHEEL_BASENAME"
# Legacy alias (docs); Docker installs the PEP 427–named file above.
ln -sf "$WHEEL_BASENAME" "$VENDOR/python/teamver-app-sdk.whl"

GENERATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
cat > "$VENDOR/manifest.json" <<EOF
{
  "generatedAt": "$GENERATED_AT",
  "platformRoot": "$PLATFORM_ROOT",
  "@teamver/app-sdk": {
    "version": "$SDK_VERSION",
    "file": "app-sdk.tgz"
  },
  "teamver-app-sdk": {
    "version": "$PY_VERSION",
    "file": "python/$WHEEL_BASENAME"
  }
}
EOF

echo "✅ vendor/teamver refreshed"
echo "   @teamver/app-sdk $SDK_VERSION → vendor/teamver/app-sdk.tgz"
echo "   teamver-app-sdk $PY_VERSION → vendor/teamver/python/$WHEEL_BASENAME (+ teamver-app-sdk.whl symlink)"
