#!/usr/bin/env bash
# Teamver Design — shared docker compose flags (Main BE / Slide deploy.sh 패턴).
# .env symlink 없이 .env.staging / .env.production 을 --env-file 로 직접 사용.

design_compose_project_name() {
  # docker-compose.yml `name: teamver-open-design` — EC2 기존 스택과 동일 (재배포 시 중복 컨테이너 방지).
  echo teamver-open-design
}

design_compose_override_file() {
  case "${DESIGN_ENV_FILE:-}" in
    .env.staging) echo docker-compose.staging.yml ;;
    .env.production) echo docker-compose.production.yml ;;
    *) echo "" ;;
  esac
}

design_compose_env_flag() {
  case "${DESIGN_ENV_FILE:-}" in
    .env.staging) echo --staging ;;
    .env.production) echo --production ;;
    *) echo "" ;;
  esac
}

# Build DESIGN_COMPOSE_ARGS: docker compose -p PROJECT -f base [-f override] --env-file ENV
# Usage:
#   design_compose_build_args "$ROOT" ".env.staging"
#   "${DESIGN_COMPOSE_ARGS[@]}" up -d --build
design_compose_build_args() {
  local root="${1:?root required}"
  local env_file="${2:?env file required}"

  DESIGN_ENV_FILE="$env_file"
  DESIGN_COMPOSE_ARGS=()

  if command -v docker-compose &>/dev/null; then
    DESIGN_COMPOSE_ARGS=(docker-compose)
  elif command -v docker &>/dev/null && docker compose version &>/dev/null; then
    DESIGN_COMPOSE_ARGS=(docker compose)
  else
    echo "❌ docker-compose or 'docker compose' not found." >&2
    return 1
  fi

  DESIGN_COMPOSE_ARGS+=(-p "$(design_compose_project_name)")
  DESIGN_COMPOSE_ARGS+=(-f "$root/docker-compose.yml")

  local override
  override="$(design_compose_override_file)"
  if [[ -n "$override" && -f "$root/$override" ]]; then
    DESIGN_COMPOSE_ARGS+=(-f "$root/$override")
  fi

  DESIGN_COMPOSE_ARGS+=(--env-file "$env_file")
}

# Human-readable compose command (DRYRUN logs).
design_compose_cmd_str() {
  echo "${DESIGN_COMPOSE_ARGS[*]}"
}
