#!/usr/bin/env bash
# Teamver Design — run_docker.sh 는 deploy.sh 로 위임 (Slide 패턴).
# 기존 호출 경로 유지: bash scripts/run_docker.sh --staging [--rds]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$ROOT/deploy.sh" "$@"
