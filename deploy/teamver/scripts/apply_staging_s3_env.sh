#!/usr/bin/env bash
# Merge S3 activation env into deploy/teamver/.env.staging (09 P1-8).
#
# Usage:
#   bash scripts/apply_staging_s3_env.sh
#   bash scripts/apply_staging_s3_env.sh --from-terraform
#   bash scripts/apply_staging_s3_env.sh --dry-run
#
# Updates only OD project-storage keys; secrets (tokens, DB password) are untouched.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.staging}"
FROM_TF=0
DRY_RUN=0

while (( $# )); do
  case "$1" in
    --from-terraform) FROM_TF=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --env-file)
      shift
      if [[ $# -eq 0 ]]; then
        echo "❌ --env-file requires path"
        exit 1
      fi
      ENV_FILE="$1"
      ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
  shift
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ env file not found: $ENV_FILE"
  echo "   cp .env.staging.example .env.staging first"
  exit 1
fi

if [[ "$FROM_TF" -eq 1 ]]; then
  snippet="$(bash "$ROOT/scripts/print_staging_s3_env.sh" --from-terraform)"
else
  snippet="$(bash "$ROOT/scripts/print_staging_s3_env.sh")"
fi
lines=()
while IFS= read -r line; do
  if [[ "$line" =~ ^[A-Z][A-Z0-9_]+= ]]; then
    lines+=("$line")
  fi
done <<EOF
$snippet
EOF

if [[ "${#lines[@]}" -eq 0 ]]; then
  echo "❌ no S3 env lines from print_staging_s3_env.sh"
  exit 1
fi

updated="$(python3 - "$ENV_FILE" "${lines[@]}" <<'PY'
import pathlib
import re
import sys

env_path = pathlib.Path(sys.argv[1])
updates: dict[str, str] = {}
for raw in sys.argv[2:]:
    if "=" not in raw:
        continue
    key, value = raw.split("=", 1)
    updates[key.strip()] = value.strip()

text = env_path.read_text(encoding="utf-8")
out_lines: list[str] = []
seen: set[str] = set()

for line in text.splitlines():
    matched = False
    stripped = line.lstrip()
    is_comment = stripped.startswith("#")
    candidate = stripped[1:].lstrip() if is_comment else stripped

    for key, value in updates.items():
        if key in seen:
            if is_comment and re.match(rf"^{re.escape(key)}=", candidate):
                matched = True
                break
            continue
        if re.match(rf"^{re.escape(key)}=", candidate):
            out_lines.append(f"{key}={value}")
            seen.add(key)
            matched = True
            break
    if not matched:
        out_lines.append(line)

missing = [key for key in updates if key not in seen]
if missing:
    if out_lines and out_lines[-1].strip():
        out_lines.append("")
    out_lines.append("# --- OD project storage (apply_staging_s3_env.sh) ---")
    for key in missing:
        out_lines.append(f"{key}={updates[key]}")

new_text = "\n".join(out_lines)
if text.endswith("\n"):
    new_text += "\n"
print(new_text)
PY
)"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> dry-run diff for $ENV_FILE"
  diff -u "$ENV_FILE" <(printf '%s' "$updated") || true
  exit 0
fi

backup="${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
cp "$ENV_FILE" "$backup"
printf '%s' "$updated" > "$ENV_FILE"
echo "✓ updated $ENV_FILE (backup: $backup)"
echo "   next: bash scripts/validate_deploy_env.sh --staging --rds"
