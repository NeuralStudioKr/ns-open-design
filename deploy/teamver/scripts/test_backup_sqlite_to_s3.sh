#!/usr/bin/env bash
# Fixture checks for backup_sqlite_to_s3.sh (09 P2-3 fallback path).
#
# Cannot exercise the live `docker compose cp` / `aws s3 cp` paths without a
# running daemon and S3 bucket, but we CAN lock down:
#   - argument parsing + required flags (--staging/--production, consistency)
#   - env-file selection (LITESTREAM_BUCKET / OD_S3_BUCKET fallback)
#   - --dry-run output (docker stop, cp, aws s3 cp commands printed, NOT executed)
#   - --prefix override
#   - help text mentions the high-leverage knobs
#
# Usage: bash deploy/teamver/scripts/test_backup_sqlite_to_s3.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/backup_sqlite_to_s3.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "❌ missing $SCRIPT"
  exit 1
fi
if [[ ! -x "$SCRIPT" ]]; then
  echo "❌ $SCRIPT not executable"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Sandboxed deploy/teamver root so we don't touch the real .env.
SANDBOX="$WORK/teamver"
mkdir -p "$SANDBOX/scripts"
cp "$SCRIPT" "$SANDBOX/scripts/"
chmod +x "$SANDBOX/scripts/backup_sqlite_to_s3.sh"

cat > "$SANDBOX/.env.staging" <<EOF
ENV=staging
LITESTREAM_BUCKET=teamver-design-staging-data
LITESTREAM_REGION=ap-northeast-2
SQLITE_BACKUP_PREFIX=sqlite-backups
EOF

cat > "$SANDBOX/.env.production" <<EOF
ENV=production
OD_S3_BUCKET=teamver-design-prod-data
OD_S3_REGION=ap-northeast-2
EOF

# Stub docker + aws so they would refuse if invoked during dry-run.
mkdir -p "$WORK/bin"
for tool in aws docker; do
  cat > "$WORK/bin/$tool" <<EOF
#!/usr/bin/env bash
echo "$tool: SHOULD NOT BE CALLED DURING DRY RUN" >&2
exit 99
EOF
  chmod +x "$WORK/bin/$tool"
done

# Without --staging/--production: must fail.
if (cd "$SANDBOX" && bash scripts/backup_sqlite_to_s3.sh --stop-daemon >/dev/null 2>&1); then
  echo "❌ expected failure without --staging/--production"
  exit 1
fi

# Without --stop-daemon AND without --allow-live-copy: must fail (consistency guard).
if (cd "$SANDBOX" && bash scripts/backup_sqlite_to_s3.sh --staging --dry-run >/dev/null 2>&1); then
  echo "❌ expected failure without --stop-daemon or --allow-live-copy"
  exit 1
fi

# Unknown flag → must fail.
if (cd "$SANDBOX" && bash scripts/backup_sqlite_to_s3.sh --not-a-flag >/dev/null 2>&1); then
  echo "❌ expected failure for unknown flag"
  exit 1
fi

# Missing env file → fail with explicit message.
out="$(cd "$WORK" && PATH="$WORK/bin:$PATH" bash "$SCRIPT" --staging --stop-daemon --dry-run 2>&1 || true)"
if ! grep -q '\.env\.staging' <<< "$out"; then
  echo "❌ expected error mentioning .env.staging when missing in cwd"
  echo "$out"
  exit 1
fi

# Staging dry-run with --stop-daemon: docker stop + cp + aws s3 cp must be DRYRUN echoes,
# not real invocations (stub would exit 99).
PATH="$WORK/bin:$PATH" out="$(cd "$SANDBOX" && bash scripts/backup_sqlite_to_s3.sh \
  --staging --stop-daemon --dry-run 2>&1)"
if ! grep -q 'mode=fallback env=staging' <<< "$out"; then
  echo "❌ dry-run output missing 'mode=fallback env=staging' header"
  echo "$out"
  exit 1
fi
if ! grep -q 'DRYRUN: docker compose --env-file .env.staging stop open-design-daemon' <<< "$out"; then
  echo "❌ dry-run did not echo docker compose stop"
  echo "$out"
  exit 1
fi
if ! grep -q 'DRYRUN: docker compose --env-file .env.staging cp open-design-daemon' <<< "$out"; then
  echo "❌ dry-run did not echo docker compose cp"
  echo "$out"
  exit 1
fi
if ! grep -q 'DRYRUN: aws s3 cp .* s3://teamver-design-staging-data/sqlite-backups/staging/' <<< "$out"; then
  echo "❌ dry-run did not echo aws s3 cp with staging bucket + default prefix"
  echo "$out"
  exit 1
fi
if ! grep -q 's3://teamver-design-staging-data/sqlite-backups/staging/LATEST.json' <<< "$out"; then
  echo "❌ dry-run did not include LATEST.json upload command"
  echo "$out"
  exit 1
fi

# --allow-live-copy alone (no --stop-daemon) should still pass dry-run.
PATH="$WORK/bin:$PATH" out="$(cd "$SANDBOX" && bash scripts/backup_sqlite_to_s3.sh \
  --staging --allow-live-copy --dry-run 2>&1)"
if ! grep -q 'DRYRUN: docker compose --env-file .env.staging cp open-design-daemon' <<< "$out"; then
  echo "❌ live-copy dry-run did not echo docker compose cp"
  echo "$out"
  exit 1
fi
# Without --stop-daemon, the stop step should NOT show up.
if grep -q 'DRYRUN: docker compose --env-file .env.staging stop open-design-daemon' <<< "$out"; then
  echo "❌ --allow-live-copy alone must not stop the daemon"
  echo "$out"
  exit 1
fi

# Production env via OD_S3_BUCKET fallback (LITESTREAM_BUCKET unset).
PATH="$WORK/bin:$PATH" out="$(cd "$SANDBOX" && bash scripts/backup_sqlite_to_s3.sh \
  --production --stop-daemon --dry-run 2>&1)"
if ! grep -q 's3://teamver-design-prod-data/sqlite-backups/production/' <<< "$out"; then
  echo "❌ production OD_S3_BUCKET fallback did not resolve"
  echo "$out"
  exit 1
fi

# --prefix override is honored.
PATH="$WORK/bin:$PATH" out="$(cd "$SANDBOX" && bash scripts/backup_sqlite_to_s3.sh \
  --staging --stop-daemon --prefix custom-backups --dry-run 2>&1)"
if ! grep -q 's3://teamver-design-staging-data/custom-backups/staging/' <<< "$out"; then
  echo "❌ --prefix override not honored in destination URL"
  echo "$out"
  exit 1
fi

# Empty bucket → must fail.
cat > "$SANDBOX/.env.broken" <<EOF
ENV=staging
LITESTREAM_BUCKET=
OD_S3_BUCKET=
EOF
# Run via env-file selection variant (we don't have one here); approach: replace
# .env.staging temporarily.
mv "$SANDBOX/.env.staging" "$SANDBOX/.env.staging.bak"
mv "$SANDBOX/.env.broken" "$SANDBOX/.env.staging"
if (cd "$SANDBOX" && PATH="$WORK/bin:$PATH" bash scripts/backup_sqlite_to_s3.sh \
  --staging --stop-daemon --dry-run >/dev/null 2>&1); then
  echo "❌ expected failure when bucket is empty"
  exit 1
fi
mv "$SANDBOX/.env.staging" "$SANDBOX/.env.broken.bak"
mv "$SANDBOX/.env.staging.bak" "$SANDBOX/.env.staging"

# Help text mentions the key flags.
help_out="$(bash "$SCRIPT" --help)"
for needle in --staging --production --stop-daemon --allow-live-copy --prefix --dry-run LITESTREAM_BUCKET OD_S3_BUCKET; do
  if ! grep -q -- "$needle" <<< "$help_out"; then
    echo "❌ help text missing $needle"
    exit 1
  fi
done

echo "✓ backup_sqlite_to_s3 fixture ok"
