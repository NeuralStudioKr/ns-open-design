#!/usr/bin/env bash
# Pre-pull Docker base images before compose build (Docker Hub timeouts on EC2).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-}"

_get_env_kv() {
  local key="$1"
  if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
    grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed "s/^['\"]//;s/['\"]$//" | xargs
    return 0
  fi
  echo ""
}

# AWS ap-northeast-2 EC2 — ECR Public Gallery is usually faster than docker.io.
NODE_IMAGE="${NODE_BASE_IMAGE:-$(_get_env_kv NODE_BASE_IMAGE)}"
RUNTIME_IMAGE="${RUNTIME_BASE_IMAGE:-$(_get_env_kv RUNTIME_BASE_IMAGE)}"
PYTHON_IMAGE="${PYTHON_BASE_IMAGE:-$(_get_env_kv PYTHON_BASE_IMAGE)}"
OPEN_DESIGN_IMAGE="${OPEN_DESIGN_IMAGE:-$(_get_env_kv OPEN_DESIGN_IMAGE)}"

NODE_IMAGE="${NODE_IMAGE:-public.ecr.aws/docker/library/node:24-alpine}"
RUNTIME_IMAGE="${RUNTIME_IMAGE:-public.ecr.aws/docker/library/node:24-bookworm-slim}"
PYTHON_IMAGE="${PYTHON_IMAGE:-public.ecr.aws/docker/library/python:3.12-slim}"

PULL_ATTEMPTS="${DOCKER_PULL_ATTEMPTS:-5}"
PULL_TIMEOUT="${DOCKER_CLIENT_TIMEOUT:-300}"
export DOCKER_CLIENT_TIMEOUT="$PULL_TIMEOUT"

pull_with_retry() {
  local image="$1"
  local attempt=1
  while [[ "$attempt" -le "$PULL_ATTEMPTS" ]]; do
    echo "==> docker pull ($attempt/$PULL_ATTEMPTS): $image"
    if docker pull "$image"; then
      echo "✓ pulled $image"
      return 0
    fi
    echo "⚠ pull failed — retry in $((attempt * 5))s"
    sleep $((attempt * 5))
    attempt=$((attempt + 1))
  done
  echo "❌ docker pull failed after $PULL_ATTEMPTS attempts: $image" >&2
  return 1
}

echo "==> Pre-pull Docker base images (timeout=${PULL_TIMEOUT}s, attempts=${PULL_ATTEMPTS})"
pull_with_retry "$NODE_IMAGE"
pull_with_retry "$RUNTIME_IMAGE"
pull_with_retry "$PYTHON_IMAGE"

if [[ -n "$OPEN_DESIGN_IMAGE" && "$OPEN_DESIGN_IMAGE" != *":staging-local"* && "$OPEN_DESIGN_IMAGE" != *"teamver-open-design"* ]]; then
  echo "==> Optional daemon image (skip local build when up --no-build): $OPEN_DESIGN_IMAGE"
  pull_with_retry "$OPEN_DESIGN_IMAGE" || echo "⚠ OPEN_DESIGN_IMAGE pull skipped (will build from Dockerfile if needed)"
fi

echo "✓ Base image pre-pull complete"
