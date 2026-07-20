#!/usr/bin/env bash
# Regression: /teamver-bff/projects list rewrite must not append a trailing slash.
# Empty `$1` → `/api/v1/projects/` made FastAPI 307 to OD-host `/api/v1/projects` (404).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONF="$ROOT/devops/nginx/teamver-design-od-bff.inc.conf"

if [[ ! -f "$CONF" ]]; then
  echo "missing nginx include: $CONF" >&2
  exit 1
fi

if grep -nE 'rewrite \^/teamver-bff/projects/\?\(\.\*\)\$ /api/v1/projects/\$1 break;' "$CONF"; then
  echo "FAIL: legacy projects rewrite still present (produces /api/v1/projects/ for list GET)" >&2
  exit 1
fi

if ! grep -qE 'rewrite \^/teamver-bff/projects/\?\$ /api/v1/projects break;' "$CONF"; then
  echo "FAIL: missing slash-safe list rewrite to /api/v1/projects" >&2
  exit 1
fi

if ! grep -qE 'rewrite \^/teamver-bff/projects/\(\.\+\)\$ /api/v1/projects/\$1 break;' "$CONF"; then
  echo "FAIL: missing nested projects rewrite" >&2
  exit 1
fi

# Simulate nginx capture behaviour with the fixed patterns.
python3 - <<'PY'
import re

list_re = re.compile(r"^/teamver-bff/projects/?$")
nested_re = re.compile(r"^/teamver-bff/projects/(.+)$")

cases = {
    "/teamver-bff/projects": "/api/v1/projects",
    "/teamver-bff/projects/": "/api/v1/projects",
    "/teamver-bff/projects/abc": "/api/v1/projects/abc",
    "/teamver-bff/projects/abc/publish": "/api/v1/projects/abc/publish",
}

for src, expected in cases.items():
    if list_re.match(src):
        got = "/api/v1/projects"
    else:
        m = nested_re.match(src)
        assert m, f"no rewrite match for {src}"
        got = f"/api/v1/projects/{m.group(1)}"
    assert got == expected, f"{src}: got {got}, expected {expected}"
    assert not got.endswith("/") or got.count("/") > 3, f"unexpected trailing-only slash: {got}"

print("ok: teamver-bff projects rewrite is slash-safe")
PY
