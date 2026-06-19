#!/usr/bin/env bash
# Idempotent OD runtime seed for Teamver Design sidecar.
# - app-config.json: onboardingCompleted (embed lock companion)
# - optional provider keys via daemon env (see docker-compose / .env)
#
# Usage (after compose is up):
#   bash scripts/seed_od_runtime_config.sh
#   bash scripts/seed_od_runtime_config.sh --staging

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE=".env"
SERVICE="open-design-daemon"
COMPOSE_FILE=""
while (( $# )); do
  case "$1" in
    --staging) ENV_FILE=".env.staging" ;;
    --production) ENV_FILE=".env.production" ;;
    --service) SERVICE="${2:?--service requires name}"; shift ;;
    --compose-file) COMPOSE_FILE="${2:?--compose-file requires path}"; shift ;;
    -h|--help)
      cat <<'EOF'
seed_od_runtime_config.sh — OD app-config onboarding seed (idempotent)

  bash scripts/seed_od_runtime_config.sh [--staging|--production] [--service NAME] [--compose-file FILE]

Requires: open-design-daemon container running (run_docker.sh).
Secrets (ANTHROPIC_API_KEY 등)는 .env → docker-compose env 주입.
EOF
      exit 0
      ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
  shift
done

if [[ ! -f "$ENV_FILE" && -f .env ]]; then
  ENV_FILE=".env"
fi

COMPOSE=(docker compose)
if [[ -n "$COMPOSE_FILE" ]]; then
  COMPOSE+=(-f "$COMPOSE_FILE")
fi
if [[ -f "$ENV_FILE" ]]; then
  COMPOSE+=(--env-file "$ENV_FILE")
fi

if ! "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx "$SERVICE"; then
  echo "❌ $SERVICE 가 실행 중이 아닙니다. 먼저 bash scripts/run_docker.sh 를 실행하세요."
  exit 1
fi

echo "==> Seeding OD app-config (onboardingCompleted) in $SERVICE …"
"${COMPOSE[@]}" exec -T "$SERVICE" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const dataDir = process.env.OD_DATA_DIR?.trim() || '/app/.od';
const configPath = path.join(dataDir, 'app-config.json');

const SEED = {
  onboardingCompleted: true,
  privacyDecisionAt: Date.now(),
};

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
if (prior.onboardingCompleted === true) {
  console.log(`app-config already seeded: ${configPath}`);
  process.exit(0);
}

const next = { ...prior, ...SEED };
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log(`app-config seeded: ${configPath}`);
NODE

echo "✓ Done. Provider keys: set ANTHROPIC_API_KEY / OD_* in $ENV_FILE (daemon env, git 금지)."
