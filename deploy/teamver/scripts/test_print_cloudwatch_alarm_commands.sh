#!/usr/bin/env bash
# Fixture checks for print_cloudwatch_alarm_commands.sh.
#
# Usage: bash deploy/teamver/scripts/test_print_cloudwatch_alarm_commands.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/print_cloudwatch_alarm_commands.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "❌ missing $SCRIPT"
  exit 1
fi

staging_out="$(SNS_TOPIC_ARN='arn:aws:sns:ap-northeast-2:000000000000:teamver-design-alerts' \
  INSTANCE_ID='i-12345' bash "$SCRIPT" --staging)"

for needle in \
  'TeamverDesignS3SyncUpFailed' \
  'TeamverDesignUsage5xx' \
  'TeamverDesignProjectAccess5xx' \
  'TeamverDesignScratchOverThreshold' \
  'TeamverDesignS3RemotePurgeFailed' \
  'teamver-design-staging-scratch-disk-80pct' \
  'teamver-design-staging-scratch-over-threshold' \
  'teamver-design-staging-s3-remote-purge-failed' \
  'teamver-design-staging-project-access-5xx' \
  'teamver_project_access_5xx' \
  'od_s3_remote_purged' \
  'od_scratch_disk_usage' \
  'overThreshold' \
  'aws cloudwatch put-metric-alarm' \
  'aws logs put-metric-filter' \
  'teamver-design-alerts'
do
  if ! grep -q -- "$needle" <<< "$staging_out"; then
    echo "❌ output missing: $needle"
    echo "$staging_out"
    exit 1
  fi
done

if grep -q 'apply:' <<< "$staging_out"; then
  echo "❌ default run should not auto-apply"
  exit 1
fi

prod_out="$(bash "$SCRIPT" --production)"
if ! grep -q 'teamver-design-production-usage-5xx' <<< "$prod_out"; then
  echo "❌ --production usage alarm name missing"
  exit 1
fi

if bash "$SCRIPT" --not-a-flag >/dev/null 2>&1; then
  echo "❌ expected failure for unknown flag"
  exit 1
fi

# Source pattern (un-escaped) — verify the JSON filter pattern actually
# uses CloudWatch JSON syntax, not bare quoted tokens. The rendered
# output is `printf %q`-escaped so we grep the script body instead.
for needle in \
  '$.metric = "od_scratch_disk_usage"' \
  '$.overThreshold = true' \
  '$.metric = "od_s3_remote_purged"' \
  '$.failed > 0'
do
  if ! grep -qF -- "$needle" "$SCRIPT"; then
    echo "❌ script body missing CW JSON filter pattern: $needle"
    exit 1
  fi
done

echo "✓ print_cloudwatch_alarm_commands fixture ok"
