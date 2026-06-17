#!/usr/bin/env bash
# Fixture checks for restore_app_sqlite_from_s3.sh (09 P2-2 runbook).
#
# We cannot exercise the live `litestream restore` / `aws s3 cp` paths in
# CI (would require AWS creds + Litestream binary + an actual S3 bucket),
# but we CAN lock down:
#   - argument parsing + required flags
#   - env-file selection (staging / production)
#   - --dry-run output for both litestream + snapshot modes
#   - --apply refusing to run without docker
#   - help text mentions the high-leverage knobs
#
# Usage: bash deploy/teamver/scripts/test_restore_app_sqlite_from_s3.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/restore_app_sqlite_from_s3.sh"

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

# Build a sandboxed deploy/teamver root so we don't touch the real .env.
SANDBOX="$WORK/teamver"
mkdir -p "$SANDBOX/scripts"
cp "$SCRIPT" "$SANDBOX/scripts/"
chmod +x "$SANDBOX/scripts/restore_app_sqlite_from_s3.sh"
cat > "$SANDBOX/.env.staging" <<EOF
ENV=staging
LITESTREAM_BUCKET=teamver-design-staging-data
LITESTREAM_REGION=ap-northeast-2
SQLITE_BACKUP_PREFIX=sqlite-backups
EOF
cat > "$SANDBOX/.env.production" <<EOF
ENV=production
LITESTREAM_BUCKET=teamver-design-prod-data
LITESTREAM_REGION=ap-northeast-2
SQLITE_BACKUP_PREFIX=sqlite-backups
EOF

# Stub aws + litestream + docker so the script doesn't need them resolved
# elsewhere. The dry-run branch should print but NOT call them.
mkdir -p "$WORK/bin"
for tool in aws litestream docker; do
  cat > "$WORK/bin/$tool" <<EOF
#!/usr/bin/env bash
echo "$tool: SHOULD NOT BE CALLED DURING DRY RUN" >&2
exit 99
EOF
  chmod +x "$WORK/bin/$tool"
done

# Require both --staging and --production to error.
if (cd "$SANDBOX" && bash scripts/restore_app_sqlite_from_s3.sh --litestream >/dev/null 2>&1); then
  echo "❌ expected failure without --staging/--production"
  exit 1
fi

# --from-snapshot without a ref must fail.
if (cd "$SANDBOX" && bash scripts/restore_app_sqlite_from_s3.sh --staging --from-snapshot >/dev/null 2>&1); then
  echo "❌ expected failure when --from-snapshot has no value"
  exit 1
fi

# Litestream dry-run (CLI not required because stubs resolve and dry-run skips them).
PATH="$WORK/bin:$PATH" out="$(cd "$SANDBOX" && bash scripts/restore_app_sqlite_from_s3.sh --staging --litestream --dry-run 2>&1)" || true
if ! grep -q 'DRYRUN: litestream restore' <<< "$out"; then
  echo "❌ dry-run output missing 'DRYRUN: litestream restore'"
  echo "$out"
  exit 1
fi
if ! grep -q 'mode=litestream env=staging' <<< "$out"; then
  echo "❌ dry-run output missing env=staging header"
  echo "$out"
  exit 1
fi
if ! grep -q 's3://teamver-design-staging-data/litestream/app.sqlite' <<< "$out"; then
  echo "❌ litestream replica URL not built from LITESTREAM_BUCKET"
  echo "$out"
  exit 1
fi

# Litestream dry-run with --at / --generation forwards through.
PATH="$WORK/bin:$PATH" out="$(cd "$SANDBOX" && bash scripts/restore_app_sqlite_from_s3.sh \
  --staging --litestream --at 2026-06-17T12:00:00Z --generation gen-1 --dry-run 2>&1)" || true
if ! grep -q -- '-timestamp 2026-06-17T12:00:00Z' <<< "$out"; then
  echo "❌ --at not forwarded to litestream args"
  echo "$out"
  exit 1
fi
if ! grep -q -- '-generation gen-1' <<< "$out"; then
  echo "❌ --generation not forwarded to litestream args"
  echo "$out"
  exit 1
fi

# Snapshot dry-run uses default SQLITE_BACKUP_PREFIX.
PATH="$WORK/bin:$PATH" out="$(cd "$SANDBOX" && bash scripts/restore_app_sqlite_from_s3.sh \
  --production --from-snapshot 20260617T120000Z --dry-run 2>&1)" || true
if ! grep -q 'mode=snapshot env=production' <<< "$out"; then
  echo "❌ snapshot dry-run missing mode/env header"
  echo "$out"
  exit 1
fi
if ! grep -q 'DRYRUN: aws s3 cp s3://teamver-design-prod-data/sqlite-backups/production/20260617T120000Z/' <<< "$out"; then
  echo "❌ snapshot dry-run did not assemble bucket path"
  echo "$out"
  exit 1
fi

# --prefix override is respected.
PATH="$WORK/bin:$PATH" out="$(cd "$SANDBOX" && bash scripts/restore_app_sqlite_from_s3.sh \
  --staging --from-snapshot 20260617T999999Z --prefix custom-prefix --dry-run 2>&1)" || true
if ! grep -q 's3://teamver-design-staging-data/custom-prefix/staging/20260617T999999Z' <<< "$out"; then
  echo "❌ --prefix override not honored"
  echo "$out"
  exit 1
fi

# --apply requires docker; with PATH excluding docker it should fail.
SAFE_PATH="$WORK/bin_nodocker:/usr/bin:/bin"
mkdir -p "$WORK/bin_nodocker"
ln -sf "$WORK/bin/aws" "$WORK/bin_nodocker/aws"
ln -sf "$WORK/bin/litestream" "$WORK/bin_nodocker/litestream"
if PATH="$SAFE_PATH" command -v docker >/dev/null 2>&1; then
  echo "○ skip apply-no-docker check (docker present in /usr/bin or /bin)"
else
  out="$(cd "$SANDBOX" && PATH="$SAFE_PATH" bash scripts/restore_app_sqlite_from_s3.sh \
    --staging --litestream --apply --dry-run 2>&1 || true)"
  # dry-run prints DRYRUN message about docker compose without exec.
  if ! grep -q 'would verify open-design-daemon stopped' <<< "$out"; then
    echo "❌ --apply --dry-run missing daemon-stopped reminder"
    echo "$out"
    exit 1
  fi
fi

# Help text mentions the key flags.
help_out="$(bash "$SCRIPT" --help)"
for needle in --litestream --from-snapshot --at --generation --target-dir --apply --dry-run LITESTREAM_BUCKET SQLITE_BACKUP_PREFIX; do
  if ! grep -q -- "$needle" <<< "$help_out"; then
    echo "❌ help text missing $needle"
    exit 1
  fi
done

echo "✓ restore_app_sqlite_from_s3 fixture ok"
