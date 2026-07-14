#!/usr/bin/env bash
# Fixture checks for rolling_deploy.sh (docs-teamver/39_4 §3).
#
# The live script talks to AWS ELBv2 + SSH so we can't exercise it in CI.
# We CAN lock down:
#   - argument parsing + required flag enforcement
#   - --dry-run output (no side effects) — aws/ssh must NOT be invoked
#   - --env staging/production selection is forwarded to deploy.sh
#   - --hosts ordering is preserved
#   - --tg-arn vs --tg-name mutually satisfy the guard
#   - help text mentions the high-leverage flags
#
# Usage: bash deploy/teamver/scripts/test_rolling_deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/rolling_deploy.sh"

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

# Stub aws + ssh so the real binaries can never fire during dry-run.
mkdir -p "$WORK/bin"
for tool in aws ssh; do
  cat > "$WORK/bin/$tool" <<EOF
#!/usr/bin/env bash
echo "$tool: SHOULD NOT BE CALLED DURING DRY RUN" >&2
exit 99
EOF
  chmod +x "$WORK/bin/$tool"
done

# Fake ssh key path — the script only checks presence, not readability.
touch "$WORK/fake.pem"

# --- Required flag enforcement ---

if PATH="$WORK/bin:$PATH" bash "$SCRIPT" --dry-run >/dev/null 2>&1; then
  echo "❌ expected failure without --env"
  exit 1
fi

if PATH="$WORK/bin:$PATH" bash "$SCRIPT" --env staging --dry-run >/dev/null 2>&1; then
  echo "❌ expected failure without --tg-arn / --tg-name"
  exit 1
fi

if PATH="$WORK/bin:$PATH" bash "$SCRIPT" \
  --env staging --tg-name tg --dry-run >/dev/null 2>&1; then
  echo "❌ expected failure without --hosts"
  exit 1
fi

if PATH="$WORK/bin:$PATH" bash "$SCRIPT" \
  --env staging --tg-name tg --hosts "ubuntu@1.2.3.4" --dry-run >/dev/null 2>&1; then
  echo "❌ expected failure without --ssh-key"
  exit 1
fi

if PATH="$WORK/bin:$PATH" bash "$SCRIPT" \
  --env production --tg-arn arn:x --hosts "" --ssh-key "$WORK/fake.pem" --dry-run >/dev/null 2>&1; then
  echo "❌ expected failure when --hosts is empty"
  exit 1
fi

if PATH="$WORK/bin:$PATH" bash "$SCRIPT" \
  --env prod --tg-arn arn:x --hosts "ubuntu@1.2.3.4" --ssh-key "$WORK/fake.pem" --dry-run >/dev/null 2>&1; then
  echo "❌ --env must reject invalid label"
  exit 1
fi

# --- Dry-run happy path ---

# TG ARN path (skips describe-target-groups lookup).
out="$(PATH="$WORK/bin:$PATH" bash "$SCRIPT" \
  --env staging \
  --tg-arn 'arn:aws:elasticloadbalancing:ap-northeast-2:0:targetgroup/teamver-stg/xyz' \
  --hosts 'ubuntu@i-0aaa ubuntu@i-0bbb' \
  --ssh-key "$WORK/fake.pem" \
  --dry-run 2>&1)"
if ! grep -q 'env=staging' <<< "$out"; then
  echo "❌ dry-run banner missing env=staging"
  echo "$out"; exit 1
fi
if ! grep -q 'hosts (2): ubuntu@i-0aaa ubuntu@i-0bbb' <<< "$out"; then
  echo "❌ hosts list not preserved in order"
  echo "$out"; exit 1
fi
if ! grep -q 'DRYRUN: aws elbv2 deregister-targets' <<< "$out"; then
  echo "❌ deregister step missing"
  echo "$out"; exit 1
fi
if ! grep -q 'DRYRUN: aws elbv2 register-targets' <<< "$out"; then
  echo "❌ register step missing"
  echo "$out"; exit 1
fi
# The remote command payload is `printf '%q'`-escaped inside the DRYRUN
# ssh line so we only assert on the ssh target + the deploy invocation
# banner printed by `==> deploy on <host>` (unescaped human-readable
# echo). That plus the ssh args grep gives a strong signal without
# fighting shell quoting in the assertion.
if ! grep -qE '==> deploy on ubuntu@i-0aaa: .*deploy.sh --staging' <<< "$out"; then
  echo "❌ deploy banner for first host missing --staging"
  echo "$out"; exit 1
fi
if ! grep -qE '==> deploy on ubuntu@i-0bbb: .*deploy.sh --staging' <<< "$out"; then
  echo "❌ deploy banner for second host missing --staging"
  echo "$out"; exit 1
fi
if ! grep -qE 'DRYRUN: ssh .*ubuntu@i-0aaa' <<< "$out"; then
  echo "❌ ssh dryrun line missing ubuntu@i-0aaa"
  echo "$out"; exit 1
fi
if ! grep -qE 'DRYRUN: ssh .*ubuntu@i-0bbb' <<< "$out"; then
  echo "❌ ssh dryrun line missing ubuntu@i-0bbb"
  echo "$out"; exit 1
fi
# Rolling order check — pin to the per-host banner "[host] user@id" so
# the banner summary at the top (which lists both hosts on the same
# line) doesn't skew line numbers.
first_line="$(grep -nE '^\[host\] ubuntu@i-0aaa$' <<< "$out" | head -n1 | cut -d: -f1)"
second_line="$(grep -nE '^\[host\] ubuntu@i-0bbb$' <<< "$out" | head -n1 | cut -d: -f1)"
if [[ -z "$first_line" || -z "$second_line" || "$first_line" -ge "$second_line" ]]; then
  echo "❌ rolling order not first-then-second (first_line=$first_line second_line=$second_line)"
  echo "$out"; exit 1
fi

# --deploy-extra is forwarded and --skip-local-health-check suppresses probe.
out="$(PATH="$WORK/bin:$PATH" bash "$SCRIPT" \
  --env production \
  --tg-arn 'arn:aws:elasticloadbalancing:ap-northeast-2:0:targetgroup/prod/xyz' \
  --hosts 'ubuntu@i-0ccc' \
  --ssh-key "$WORK/fake.pem" \
  --deploy-extra '--rds --no-cache' \
  --skip-local-health-check \
  --dry-run 2>&1)"
if ! grep -qE 'deploy on ubuntu@i-0ccc: .*deploy\.sh --production --rds --no-cache' <<< "$out"; then
  echo "❌ --deploy-extra not forwarded to deploy.sh"
  echo "$out"; exit 1
fi
if ! grep -q 'skipping host-local health check' <<< "$out"; then
  echo "❌ --skip-local-health-check did not suppress probe"
  echo "$out"; exit 1
fi

# --tg-name path resolves to a dryrun ARN stub.
out="$(PATH="$WORK/bin:$PATH" bash "$SCRIPT" \
  --env staging \
  --tg-name teamver-stg-tg \
  --hosts 'ubuntu@i-0ddd' \
  --ssh-key "$WORK/fake.pem" \
  --dry-run 2>&1)"
if ! grep -q 'DRYRUN: TG_ARN=arn:aws:elasticloadbalancing:' <<< "$out"; then
  echo "❌ --tg-name did not produce a dryrun ARN stub"
  echo "$out"; exit 1
fi

# Help text mentions the key flags so operators discover them.
help_out="$(bash "$SCRIPT" --help)"
for needle in --env --tg-arn --tg-name --hosts --ssh-key --dry-run --deploy-extra --drain-wait --healthy-wait --skip-local-health-check; do
  if ! grep -q -- "$needle" <<< "$help_out"; then
    echo "❌ help text missing $needle"
    exit 1
  fi
done

echo "✓ rolling_deploy fixture ok"
