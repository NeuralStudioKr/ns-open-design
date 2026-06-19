#!/usr/bin/env bash
# Static fixture — Design deploy uses --env-file directly (no .env symlink).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$ROOT/deploy.sh"
RUN_DOCKER="$ROOT/scripts/run_docker.sh"
LIB="$ROOT/scripts/lib/design_compose.sh"

for f in "$DEPLOY" "$RUN_DOCKER" "$LIB" "$ROOT/docker-compose.staging.yml" "$ROOT/docker-compose.production.yml"; do
  if [[ ! -f "$f" ]]; then
    echo "❌ missing $f"
    exit 1
  fi
done

bash -n "$DEPLOY"
bash -n "$RUN_DOCKER"
bash -n "$LIB"

for script in "$DEPLOY" "$RUN_DOCKER" "$ROOT/scripts/run_od_core_verify.sh"; do
  if grep -q 'ln -sf.*\.env' "$script" 2>/dev/null || grep -q 'ln -sf "$ENV_FILE" .env' "$script" 2>/dev/null; then
    echo "❌ $script must not create .env symlink"
    exit 1
  fi
done

if ! grep -q 'exec bash "$ROOT/deploy.sh"' "$RUN_DOCKER"; then
  echo "❌ run_docker.sh must delegate to deploy.sh"
  exit 1
fi

# design_compose_build_args produces expected flags
# shellcheck source=/dev/null
source "$LIB"
design_compose_build_args "$ROOT" ".env.staging"
joined="${DESIGN_COMPOSE_ARGS[*]}"
for token in \
  "-p teamver-open-design" \
  "-f $ROOT/docker-compose.yml" \
  "-f $ROOT/docker-compose.staging.yml" \
  "--env-file .env.staging"
do
  if [[ "$joined" != *"$token"* ]]; then
    echo "❌ DESIGN_COMPOSE_ARGS missing token: $token"
    echo "   got: $joined"
    exit 1
  fi
done

design_compose_build_args "$ROOT" ".env.production"
joined="${DESIGN_COMPOSE_ARGS[*]}"
if [[ "$joined" != *"-p teamver-open-design"* ]]; then
  echo "❌ production must keep teamver-open-design project: $joined"
  exit 1
fi

if ! grep -q 'env_file:' "$ROOT/docker-compose.staging.yml"; then
  echo "❌ staging override must set teamver-design-api env_file"
  exit 1
fi

if grep -E '^[[:space:]]+env_file:' "$ROOT/docker-compose.yml" | grep -qv '^[[:space:]]*#'; then
  echo "❌ base docker-compose.yml must not set teamver-design-api env_file (use override)"
  exit 1
fi

echo "✓ design compose env fixture ok"
