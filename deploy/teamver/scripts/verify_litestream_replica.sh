#!/usr/bin/env bash
# Litestream S3 replica 증적 (09 P2-1 / G2).
#
# "replica 객체" = Litestream이 app.sqlite WAL을 복제해 S3에 쌓는 객체들.
# 키 prefix: litestream/app.sqlite/... (generation·segment 파일)
#
# Usage:
#   bash scripts/verify_litestream_replica.sh --staging
#   bash scripts/verify_litestream_replica.sh --production
#   SKIP_S3_PROBE=1 bash scripts/verify_litestream_replica.sh --staging  # container only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LITESTREAM_CONTAINER="${LITESTREAM_CONTAINER:-teamver-design-litestream}"
REPLICA_PREFIX="${LITESTREAM_REPLICA_PREFIX:-litestream/app.sqlite}"

ENV_FILE=""
ENV_LABEL=""

usage() {
  cat <<'EOF'
verify_litestream_replica.sh — Litestream sidecar + S3 replica 객체 확인

  bash scripts/verify_litestream_replica.sh --staging
  bash scripts/verify_litestream_replica.sh --production

ENV:
  SKIP_S3_PROBE=1           S3 ls 생략 (컨테이너·sync-interval 만)
  LITESTREAM_REPLICA_PREFIX 기본 litestream/app.sqlite
  AWS_PROFILE / AWS_REGION  EC2 instance profile 사용 시 보통 불필요

AWS 콘솔:
  S3 → teamver-design-{staging|prod}-data → prefix "litestream/" → app.sqlite/ 하위
  Last modified 가 최근이면 복제 동작 중.
EOF
}

while (( $# )); do
  case "$1" in
    --staging) ENV_FILE=".env.staging"; ENV_LABEL=staging ;;
    --production) ENV_FILE=".env.production"; ENV_LABEL=production ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ -z "$ENV_FILE" ]]; then
  echo "❌ --staging 또는 --production 필요"
  usage
  exit 1
fi

ENV_PATH="$ROOT/$ENV_FILE"
if [[ ! -f "$ENV_PATH" ]]; then
  echo "❌ $ENV_PATH 없음"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_PATH"
set +a

bucket="${LITESTREAM_BUCKET:-${OD_S3_BUCKET:-}}"
region="${LITESTREAM_REGION:-${OD_S3_REGION:-${AWS_REGION:-ap-northeast-2}}}"
sync_interval="${LITESTREAM_SYNC_INTERVAL:-3s}"

pass=0
fail=0
ok()   { echo "✓ $1"; pass=$((pass + 1)); }
nope() { echo "✗ $1"; fail=$((fail + 1)); }
skip() { echo "○ $1"; }

echo "==> Litestream replica verify ($ENV_LABEL)"
echo "    bucket=$bucket region=$region prefix=$REPLICA_PREFIX sync-interval=$sync_interval"
echo

if [[ -z "$bucket" ]]; then
  nope "LITESTREAM_BUCKET / OD_S3_BUCKET unset"
  exit 1
fi

if [[ -n "${OD_S3_BUCKET:-}" && "$bucket" != "${OD_S3_BUCKET}" ]]; then
  nope "LITESTREAM_BUCKET=$bucket != OD_S3_BUCKET=${OD_S3_BUCKET}"
else
  ok "LITESTREAM_BUCKET co-located with OD_S3_BUCKET"
fi

if command -v docker >/dev/null 2>&1; then
  if docker inspect "$LITESTREAM_CONTAINER" >/dev/null 2>&1; then
    state="$(docker inspect -f '{{.State.Status}}' "$LITESTREAM_CONTAINER" 2>/dev/null || echo unknown)"
    if [[ "$state" == "running" ]]; then
      ok "litestream container running ($LITESTREAM_CONTAINER)"
      if docker logs "$LITESTREAM_CONTAINER" --tail 200 2>&1 | grep -q 'attempt to write a readonly database'; then
        nope "litestream logs: readonly database — compose volume teamver_od_data:/data must be RW (not :ro)"
      elif docker logs "$LITESTREAM_CONTAINER" --tail 200 2>&1 | grep -qE 'GetBucketLocation|AccessDenied'; then
        nope "litestream logs: S3 IAM — role needs s3:GetBucketLocation + litestream/* (doc 18 §3.1)"
      fi
      container_interval="$(docker exec "$LITESTREAM_CONTAINER" sh -lc 'printf "%s" "${LITESTREAM_SYNC_INTERVAL:-}"' 2>/dev/null || true)"
      if [[ -n "$container_interval" ]]; then
        ok "litestream container LITESTREAM_SYNC_INTERVAL=$container_interval"
      else
        skip "litestream container LITESTREAM_SYNC_INTERVAL unset (litestream.yml default)"
      fi
    else
      nope "litestream container state=$state (expected running)"
    fi
  else
    nope "litestream container '$LITESTREAM_CONTAINER' not found (docker compose up?)"
  fi
else
  skip "docker not available — container check skipped"
fi

if [[ "${SKIP_S3_PROBE:-0}" == "1" ]]; then
  skip "S3 replica probe skipped (SKIP_S3_PROBE=1)"
else
  if ! command -v aws >/dev/null 2>&1; then
    skip "aws CLI not available — S3 replica probe skipped"
  else
    parent_prefix="litestream/"
    object_prefix="${REPLICA_PREFIX%/}/"
    if [[ "$object_prefix" != litestream/app.sqlite/ ]]; then
      parent_prefix="$(dirname "$object_prefix")/"
    fi

    listing="$(aws s3 ls "s3://${bucket}/${parent_prefix}" --region "$region" 2>&1)" || true
    if [[ -z "$listing" ]]; then
      nope "S3 s3://${bucket}/${parent_prefix} — no objects (replica 미생성 또는 IAM/ListBucket 거부)"
      echo "    hint: daemon 기동 후 채팅 1회 → 10~30s 대기 → 재실행"
    else
      ok "S3 prefix s3://${bucket}/${parent_prefix} has entries"
      echo "$listing" | head -5 | sed 's/^/    /'
      if echo "$listing" | grep -q 'app.sqlite'; then
        ok "S3 replica path contains app.sqlite/"
      fi
    fi

    deep="$(aws s3 ls "s3://${bucket}/${object_prefix}" --region "$region" 2>&1)" || true
    if [[ -n "$deep" ]]; then
      ok "S3 s3://${bucket}/${object_prefix} — generation/segment objects present"
      echo "$deep" | head -5 | sed 's/^/    /'
    else
      nope "S3 s3://${bucket}/${object_prefix} — empty (Litestream 아직 첫 sync 전이거나 실패)"
      echo "    triage: docker logs $LITESTREAM_CONTAINER --tail 50"
    fi
  fi
fi

echo
echo "==> $pass passed, $fail failed"
if (( fail > 0 )); then
  echo
  echo "Litestream replica verify FAILED — docs-teamver/09 §P2-1 · 20 §6.2 · 18 IAM"
  exit 1
fi

echo
echo "AWS Console: S3 → $bucket → Browse → prefix litestream/ → app.sqlite/"
exit 0
