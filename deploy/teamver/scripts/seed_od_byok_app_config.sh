#!/usr/bin/env bash
# Merge BYOK (API mode) fields into daemon app-config.json — secrets 는 stdout 에 출력하지 않음.
#
# Usage (daemon container running):
#   bash scripts/seed_od_byok_app_config.sh --staging
#   bash scripts/seed_od_byok_app_config.sh --staging --service od-core-verify
#
# Env (from .env.staging / shell):
#   ANTHROPIC_API_KEY / OPENAI_API_KEY (하나 이상)
#   OD_BYOK_PROTOCOL (optional, default: anthropic if ANTHROPIC_API_KEY set else openai)
#   OD_BYOK_MODEL (optional)
#   OD_BYOK_BASE_URL (optional)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE=".env"
SERVICE="open-design-daemon"
COMPOSE_FILE=""

usage() {
  cat <<'EOF'
seed_od_byok_app_config.sh — app-config.json BYOK seed (idempotent merge)

  bash scripts/seed_od_byok_app_config.sh [--staging|--production]
  bash scripts/seed_od_byok_app_config.sh --staging --service od-core-verify --compose-file docker-compose.od-core-verify.yml

Reads ANTHROPIC_API_KEY / OPENAI_API_KEY from env-file. Keys are never printed.
Also sets onboardingCompleted=true for embed UI lock companion.
EOF
}

while (( $# )); do
  case "$1" in
    --staging) ENV_FILE=".env.staging" ;;
    --production) ENV_FILE=".env.production" ;;
    --service) SERVICE="${2:?--service requires name}"; shift ;;
    --compose-file) COMPOSE_FILE="${2:?--compose-file requires path}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ ! -f "$ENV_FILE" && -f .env ]]; then
  ENV_FILE=".env"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ env file 없음 ($ENV_FILE). example 을 복사하세요."
  exit 1
fi

COMPOSE=(docker compose)
if [[ -n "$COMPOSE_FILE" ]]; then
  COMPOSE+=(-f "$COMPOSE_FILE")
fi
COMPOSE+=(--env-file "$ENV_FILE")

if ! "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx "$SERVICE"; then
  echo "❌ $SERVICE 가 실행 중이 아닙니다."
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

PROTOCOL="${OD_BYOK_PROTOCOL:-}"
API_KEY=""
BASE_URL="${OD_BYOK_BASE_URL:-}"
MODEL="${OD_BYOK_MODEL:-}"

if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  if [[ -z "$PROTOCOL" ]]; then PROTOCOL="anthropic"; fi
  if [[ "$PROTOCOL" == "anthropic" && -z "$API_KEY" ]]; then
    API_KEY="$ANTHROPIC_API_KEY"
    [[ -n "$BASE_URL" ]] || BASE_URL="https://api.anthropic.com"
    [[ -n "$MODEL" ]] || MODEL="claude-sonnet-4-5"
  fi
fi

if [[ -z "$API_KEY" && -n "${OPENAI_API_KEY:-}" ]]; then
  if [[ -z "$PROTOCOL" ]]; then PROTOCOL="openai"; fi
  if [[ "$PROTOCOL" == "openai" ]]; then
    API_KEY="$OPENAI_API_KEY"
    [[ -n "$BASE_URL" ]] || BASE_URL="https://api.openai.com/v1"
    [[ -n "$MODEL" ]] || MODEL="gpt-4.1"
  fi
fi

if [[ -z "$API_KEY" ]]; then
  echo "❌ ANTHROPIC_API_KEY 또는 OPENAI_API_KEY 가 $ENV_FILE 에 없습니다."
  exit 1
fi

if [[ -z "$PROTOCOL" ]]; then
  echo "❌ OD_BYOK_PROTOCOL 를 지정하거나 provider key 를 설정하세요."
  exit 1
fi

echo "==> Seeding BYOK app-config in $SERVICE (protocol=$PROTOCOL, key=***) …"

"${COMPOSE[@]}" exec -T \
  -e "SEED_PROTOCOL=$PROTOCOL" \
  -e "SEED_API_KEY=$API_KEY" \
  -e "SEED_BASE_URL=$BASE_URL" \
  -e "SEED_MODEL=$MODEL" \
  "$SERVICE" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const dataDir = process.env.OD_DATA_DIR?.trim() || '/app/.od';
const configPath = path.join(dataDir, 'app-config.json');

const protocol = process.env.SEED_PROTOCOL?.trim();
const apiKey = process.env.SEED_API_KEY?.trim();
const baseUrl = process.env.SEED_BASE_URL?.trim();
const model = process.env.SEED_MODEL?.trim();

if (!protocol || !apiKey) {
  console.error('missing SEED_PROTOCOL or SEED_API_KEY in container env');
  process.exit(1);
}

function readExisting() {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed != null && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err instanceof SyntaxError)) return {};
    throw err;
  }
}

const prior = readExisting();
const patch = {
  mode: 'api',
  onboardingCompleted: true,
  privacyDecisionAt: prior.privacyDecisionAt ?? Date.now(),
  apiProtocol: protocol,
  apiKey,
  baseUrl,
  model,
  agentId: null,
  agentModels: {},
  agentCliEnv: {},
};

const unchanged =
  prior.mode === patch.mode
  && prior.onboardingCompleted === true
  && prior.apiProtocol === patch.apiProtocol
  && prior.apiKey === patch.apiKey
  && prior.baseUrl === patch.baseUrl
  && prior.model === patch.model;

if (unchanged) {
  console.log(`app-config BYOK already up to date: ${configPath}`);
  process.exit(0);
}

const next = { ...prior, ...patch };
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log(`app-config BYOK merged: ${configPath}`);
NODE

echo "✓ Done. Browser/API chat 은 API mode 로 동작해야 합니다."
