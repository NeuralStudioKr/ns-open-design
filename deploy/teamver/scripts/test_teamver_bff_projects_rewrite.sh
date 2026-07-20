#!/usr/bin/env bash
# Regression: /teamver-bff/* → /api/v1/* rewrites must not produce trailing-only
# slash upstreams (FastAPI redirect_slashes → OD-host /api/v1 → daemon 404).
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

for needle in \
  'rewrite ^/teamver-bff/projects/?$ /api/v1/projects break;' \
  'rewrite ^/teamver-bff/projects/(.+?)/?$ /api/v1/projects/$1 break;' \
  'rewrite ^/teamver-bff/drive/?$ /api/v1/drive break;' \
  'rewrite ^/teamver-bff/drive/(.+?)/?$ /api/v1/drive/$1 break;' \
  'rewrite ^/teamver-bff/canvas/?$ /api/v1/canvas break;' \
  'rewrite ^/teamver-bff/canvas/(.+?)/?$ /api/v1/canvas/$1 break;' \
  'rewrite ^/teamver-bff/?$ /api/v1 break;' \
  'rewrite ^/teamver-bff/(.+?)/?$ /api/v1/$1 break;'
do
  if ! grep -qF "$needle" "$CONF"; then
    echo "FAIL: missing slash-safe rewrite: $needle" >&2
    exit 1
  fi
done

python3 - <<'PY'
import re

def apply(rules, path: str) -> str | None:
    for pattern, template in rules:
        m = re.match(pattern, path)
        if m:
            out = template
            if m.lastindex:
                out = template.replace("$1", m.group(1))
            return out
    return None

projects = [
    (r"^/teamver-bff/projects/?$", "/api/v1/projects"),
    (r"^/teamver-bff/projects/(.+?)/?$", "/api/v1/projects/$1"),
]
drive = [
    (r"^/teamver-bff/drive/?$", "/api/v1/drive"),
    (r"^/teamver-bff/drive/(.+?)/?$", "/api/v1/drive/$1"),
]
canvas = [
    (r"^/teamver-bff/canvas/?$", "/api/v1/canvas"),
    (r"^/teamver-bff/canvas/(.+?)/?$", "/api/v1/canvas/$1"),
]
generic = [
    (r"^/teamver-bff/?$", "/api/v1"),
    (r"^/teamver-bff/(.+?)/?$", "/api/v1/$1"),
]

cases = [
    (projects, "/teamver-bff/projects", "/api/v1/projects"),
    (projects, "/teamver-bff/projects/", "/api/v1/projects"),
    (projects, "/teamver-bff/projects/abc", "/api/v1/projects/abc"),
    (projects, "/teamver-bff/projects/abc/", "/api/v1/projects/abc"),
    (projects, "/teamver-bff/projects/abc/publish", "/api/v1/projects/abc/publish"),
    (projects, "/teamver-bff/projects/abc/publish/", "/api/v1/projects/abc/publish"),
    (drive, "/teamver-bff/drive/api/folders", "/api/v1/drive/api/folders"),
    (drive, "/teamver-bff/drive/api/folders/", "/api/v1/drive/api/folders"),
    (canvas, "/teamver-bff/canvas/preview", "/api/v1/canvas/preview"),
    (canvas, "/teamver-bff/canvas/preview/", "/api/v1/canvas/preview"),
    (generic, "/teamver-bff/runtime-config", "/api/v1/runtime-config"),
    (generic, "/teamver-bff/runtime-config/", "/api/v1/runtime-config"),
]

for rules, src, expected in cases:
    got = apply(rules, src)
    assert got == expected, f"{src}: got {got}, expected {expected}"
    assert not got.endswith("/") or got.rstrip("/").count("/") >= 2, f"bad slash: {got}"

print("ok: teamver-bff rewrites are slash-safe")
PY
