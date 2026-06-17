#!/usr/bin/env bash
# Print AWS CLI commands for Track A storage alarms (09 P1-10/P0-6).

set -euo pipefail

ENV_NAME="staging"
INSTANCE_ID="${INSTANCE_ID:-}"
LOG_GROUP="${LOG_GROUP:-}"
SNS_TOPIC_ARN="${SNS_TOPIC_ARN:-}"
REGION="${AWS_REGION:-ap-northeast-2}"
SCRATCH_PATH="${SCRATCH_PATH:-/app/.od/scratch}"

usage() {
  cat <<'EOF'
print_cloudwatch_alarm_commands.sh — emit storage alarm AWS CLI commands

  INSTANCE_ID=i-... SNS_TOPIC_ARN=arn:... bash scripts/print_cloudwatch_alarm_commands.sh --staging
  LOG_GROUP=/teamver/design/prod/open-design-daemon bash scripts/print_cloudwatch_alarm_commands.sh --production

Prints:
  - metric filter for daemon sync-up failures (`od_s3_sync_up_failed`)
  - alarm for sync-up failures
  - alarm template for scratch disk percent used (CW Agent metric)
EOF
}

while (( $# )); do
  case "$1" in
    --staging)
      ENV_NAME="staging"
      LOG_GROUP="${LOG_GROUP:-/teamver/design/staging/open-design-daemon}"
      ;;
    --production)
      ENV_NAME="production"
      LOG_GROUP="${LOG_GROUP:-/teamver/design/prod/open-design-daemon}"
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
  shift
done

LOG_GROUP="${LOG_GROUP:-/teamver/design/staging/open-design-daemon}"

alarm_actions=()
if [[ -n "$SNS_TOPIC_ARN" ]]; then
  alarm_actions=(--alarm-actions "$SNS_TOPIC_ARN")
fi

cat <<EOF
# 1) Log metric filter: daemon S3 sync-up failures
aws logs put-metric-filter \\
  --region "$REGION" \\
  --log-group-name "$LOG_GROUP" \\
  --filter-name "teamver-design-${ENV_NAME}-s3-sync-up-failed" \\
  --filter-pattern '"od_s3_sync_up_failed"' \\
  --metric-transformations \\
    metricName=TeamverDesignS3SyncUpFailed,metricNamespace=Teamver/Design,metricValue=1,defaultValue=0

# 2) Alarm: any sync-up failure in 5 minutes
aws cloudwatch put-metric-alarm \\
  --region "$REGION" \\
  --alarm-name "teamver-design-${ENV_NAME}-s3-sync-up-failed" \\
  --namespace "Teamver/Design" \\
  --metric-name "TeamverDesignS3SyncUpFailed" \\
  --statistic Sum \\
  --period 300 \\
  --evaluation-periods 1 \\
  --threshold 1 \\
  --comparison-operator GreaterThanOrEqualToThreshold \\
  --treat-missing-data notBreaching${alarm_actions[*]:+ \\
  ${alarm_actions[*]}}

# 3) Alarm template: scratch disk > 80%
# Requires CloudWatch Agent disk metric with path=$SCRATCH_PATH.
aws cloudwatch put-metric-alarm \\
  --region "$REGION" \\
  --alarm-name "teamver-design-${ENV_NAME}-scratch-disk-80pct" \\
  --namespace "CWAgent" \\
  --metric-name "disk_used_percent" \\
  --dimensions Name=InstanceId,Value="${INSTANCE_ID:-i-REPLACE}" Name=path,Value="$SCRATCH_PATH" \\
  --statistic Average \\
  --period 300 \\
  --evaluation-periods 2 \\
  --threshold 80 \\
  --comparison-operator GreaterThanOrEqualToThreshold \\
  --treat-missing-data missing${alarm_actions[*]:+ \\
  ${alarm_actions[*]}}
EOF
