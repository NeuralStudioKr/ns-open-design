#!/usr/bin/env bash
# Fixture for s3_lifecycle_policy.sh (09 P3-8 lifecycle policy).
#
# We can't hit real AWS, but we lock down:
#   • required --staging / --production
#   • the printed JSON includes the three expected rule IDs
#   • prefixes are derived from .env values and end with "/"
#   • S3_LIFECYCLE_SCRATCH_PREFIX="" disables the scratch rule
#   • --apply --dry-run prints the aws command without invoking aws
#
# Usage: bash deploy/teamver/scripts/test_s3_lifecycle_policy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/s3_lifecycle_policy.sh"

if [[ ! -f "$SCRIPT" || ! -x "$SCRIPT" ]]; then
  echo "❌ missing or not executable: $SCRIPT"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

SANDBOX="$WORK/teamver"
mkdir -p "$SANDBOX/scripts"
cp "$SCRIPT" "$SANDBOX/scripts/"
chmod +x "$SANDBOX/scripts/s3_lifecycle_policy.sh"

cat > "$SANDBOX/.env.staging" <<'EOF'
ENV=staging
LITESTREAM_BUCKET=teamver-design-staging-data
LITESTREAM_REGION=ap-northeast-2
OD_S3_PREFIX=design
SQLITE_BACKUP_PREFIX=sqlite-backups
S3_LIFECYCLE_SQLITE_BACKUP_DAYS=21
S3_LIFECYCLE_SCRATCH_PREFIX=_deleted
S3_LIFECYCLE_SCRATCH_DAYS=10
EOF

cat > "$SANDBOX/.env.production" <<'EOF'
ENV=production
LITESTREAM_BUCKET=teamver-design-prod-data
LITESTREAM_REGION=ap-northeast-2
OD_S3_PREFIX=design/
SQLITE_BACKUP_PREFIX=sqlite-backups
S3_LIFECYCLE_SCRATCH_PREFIX=
EOF

# Missing env flag must fail.
if (cd "$SANDBOX" && bash scripts/s3_lifecycle_policy.sh >/dev/null 2>&1); then
  echo "❌ expected failure without --staging/--production"
  exit 1
fi

# Default print (no --apply).
out="$(cd "$SANDBOX" && bash scripts/s3_lifecycle_policy.sh --staging 2>&1)"
for needle in \
  '"ID": "od-abort-incomplete-multipart"' \
  '"DaysAfterInitiation": 7' \
  '"ID": "od-sqlite-backups-expire"' \
  '"Prefix": "sqlite-backups/"' \
  '"Days": 21' \
  '"ID": "od-scratch-evict-expire"' \
  '"Prefix": "design/_deleted/"' \
  '"Days": 10'
do
  if ! grep -qF "$needle" <<< "$out"; then
    echo "❌ staging JSON missing: $needle"
    echo "$out"
    exit 1
  fi
done

# Active prefix already has trailing slash — must NOT become "design//_deleted/".
if grep -qF 'design//_deleted/' <<< "$out"; then
  echo "❌ active prefix double-slash detected"
  echo "$out"
  exit 1
fi

# Production env has empty S3_LIFECYCLE_SCRATCH_PREFIX → no scratch rule.
out_prod="$(cd "$SANDBOX" && bash scripts/s3_lifecycle_policy.sh --production 2>&1)"
if grep -qF 'od-scratch-evict-expire' <<< "$out_prod"; then
  echo "❌ scratch rule should be disabled when S3_LIFECYCLE_SCRATCH_PREFIX is empty"
  echo "$out_prod"
  exit 1
fi
if ! grep -qF 'scratch rule DISABLED' <<< "$out_prod"; then
  echo "❌ disabled scratch message missing"
  echo "$out_prod"
  exit 1
fi
# Production prefix already has trailing slash in env — no double slash.
if grep -qF '"Prefix": "design//"' <<< "$out_prod"; then
  echo "❌ production active prefix double-slash"
  echo "$out_prod"
  exit 1
fi

# --apply --dry-run must print aws command without running aws.
SAFE_PATH="$WORK/bin:/usr/bin:/bin"
mkdir -p "$WORK/bin"
cat > "$WORK/bin/aws" <<'EOF'
#!/usr/bin/env bash
echo "aws: SHOULD NOT BE INVOKED ON DRY RUN" >&2
exit 99
EOF
chmod +x "$WORK/bin/aws"
out_dry="$(cd "$SANDBOX" && PATH="$SAFE_PATH" bash scripts/s3_lifecycle_policy.sh --staging --apply --dry-run 2>&1)"
if ! grep -q 'DRYRUN: aws s3api put-bucket-lifecycle-configuration' <<< "$out_dry"; then
  echo "❌ --apply --dry-run missing DRYRUN aws command"
  echo "$out_dry"
  exit 1
fi
if ! grep -q -- '--bucket teamver-design-staging-data' <<< "$out_dry"; then
  echo "❌ --apply --dry-run bucket flag missing"
  echo "$out_dry"
  exit 1
fi

# JSON must be valid: try parsing via python if available.
if command -v python3 >/dev/null 2>&1; then
  if ! python3 -c "import json,sys; json.loads(sys.stdin.read())" <<< "$(cd "$SANDBOX" && bash scripts/s3_lifecycle_policy.sh --staging | sed -n '/^{/,$p')" >/dev/null 2>&1; then
    echo "❌ printed JSON is not parseable"
    exit 1
  fi
fi

# Help text mentions the env knobs.
help_out="$(bash "$SCRIPT" --help)"
for needle in S3_LIFECYCLE_SQLITE_BACKUP_DAYS S3_LIFECYCLE_SCRATCH_PREFIX S3_LIFECYCLE_SCRATCH_DAYS --apply --diff; do
  if ! grep -q -- "$needle" <<< "$help_out"; then
    echo "❌ help text missing $needle"
    exit 1
  fi
done

echo "✓ s3_lifecycle_policy fixture ok"
