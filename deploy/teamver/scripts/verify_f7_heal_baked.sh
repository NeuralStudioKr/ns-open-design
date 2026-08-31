#!/usr/bin/env bash
# Post-bake smoke: confirm F7 heal pipeline landed in the web bundle (read-only container safe).
set -euo pipefail

CONTAINER="${VERIFY_F7_CONTAINER:-teamver-open-design-daemon}"
WEB_OUT="${VERIFY_F7_WEB_OUT:-/app/apps/web/out/_next/static/chunks}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "✗ container not running: $CONTAINER" >&2
  exit 1
fi

map_count="$(
  docker exec "$CONTAINER" sh -c "grep -l healAiGeneratedDeckMarkup ${WEB_OUT}/*.js.map 2>/dev/null | wc -l" \
    | tr -d ' '
)"
drop_count="$(
  docker exec "$CONTAINER" sh -c "grep -l dropEmptyLikelyDeckSlides ${WEB_OUT}/*.js.map 2>/dev/null | wc -l" \
    | tr -d ' '
)"

echo "==> F7 heal bake verify ($CONTAINER)"
echo "    healAiGeneratedDeckMarkup sourcemaps: ${map_count}"
echo "    dropEmptyLikelyDeckSlides sourcemaps: ${drop_count}"

if [[ "${map_count:-0}" -ge 1 && "${drop_count:-0}" -ge 1 ]]; then
  echo "✓ F7 heal symbols present in web bundle"
  exit 0
fi

echo "✗ F7 heal symbols missing from web bundle sourcemaps" >&2
exit 1
