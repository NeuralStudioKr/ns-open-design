#!/usr/bin/env bash
# Print or apply AWS CLI commands for Track A storage / usage alarms (09 P1-10 / P0-6, 11 §3 U-7).
#
# Usage:
#   INSTANCE_ID=i-... SNS_TOPIC_ARN=arn:... \
#     bash scripts/print_cloudwatch_alarm_commands.sh --staging
#   bash scripts/print_cloudwatch_alarm_commands.sh --staging --apply
#   LOG_GROUP=/teamver/design/prod/open-design-daemon \
#     bash scripts/print_cloudwatch_alarm_commands.sh --production
#
# Prints (or runs with --apply):
#   - log metric filter: daemon sync-up failures (`od_s3_sync_up_failed`)
#   - log metric filter: design-api usage 5xx (`teamver_usage_5xx`)
#   - alarm: sync-up failures
#   - alarm: usage 5xx burst
#   - alarm template: scratch disk percent used (CW Agent metric)
#   - log metric filter + alarm: daemon scratch over threshold
#     (`od_scratch_disk_usage` + `"overThreshold":true`)

set -euo pipefail

ENV_NAME="staging"
INSTANCE_ID="${INSTANCE_ID:-}"
LOG_GROUP="${LOG_GROUP:-}"
DESIGN_API_LOG_GROUP="${DESIGN_API_LOG_GROUP:-}"
SNS_TOPIC_ARN="${SNS_TOPIC_ARN:-}"
REGION="${AWS_REGION:-ap-northeast-2}"
SCRATCH_PATH="${SCRATCH_PATH:-/app/.od/scratch}"
APPLY=0

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
}

while (( $# )); do
  case "$1" in
    --staging)
      ENV_NAME="staging"
      LOG_GROUP="${LOG_GROUP:-/teamver/design/staging/open-design-daemon}"
      DESIGN_API_LOG_GROUP="${DESIGN_API_LOG_GROUP:-/teamver/design/staging/design-api}"
      ;;
    --production)
      ENV_NAME="production"
      LOG_GROUP="${LOG_GROUP:-/teamver/design/prod/open-design-daemon}"
      DESIGN_API_LOG_GROUP="${DESIGN_API_LOG_GROUP:-/teamver/design/prod/design-api}"
      ;;
    --apply) APPLY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
  shift
done

LOG_GROUP="${LOG_GROUP:-/teamver/design/staging/open-design-daemon}"
DESIGN_API_LOG_GROUP="${DESIGN_API_LOG_GROUP:-/teamver/design/staging/design-api}"

if [[ "$APPLY" -eq 1 ]]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "❌ aws CLI required for --apply"
    exit 1
  fi
fi

alarm_action_args=()
if [[ -n "$SNS_TOPIC_ARN" ]]; then
  alarm_action_args=(--alarm-actions "$SNS_TOPIC_ARN")
fi

# Build each command as an array so --apply can exec it AND we can echo it.
declare -a SYNC_UP_FILTER=(
  aws logs put-metric-filter
  --region "$REGION"
  --log-group-name "$LOG_GROUP"
  --filter-name "teamver-design-${ENV_NAME}-s3-sync-up-failed"
  --filter-pattern '"od_s3_sync_up_failed"'
  --metric-transformations
    "metricName=TeamverDesignS3SyncUpFailed,metricNamespace=Teamver/Design,metricValue=1,defaultValue=0"
)

declare -a USAGE_FILTER=(
  aws logs put-metric-filter
  --region "$REGION"
  --log-group-name "$DESIGN_API_LOG_GROUP"
  --filter-name "teamver-design-${ENV_NAME}-usage-5xx"
  --filter-pattern '"teamver_usage_5xx"'
  --metric-transformations
    "metricName=TeamverDesignUsage5xx,metricNamespace=Teamver/Design,metricValue=1,defaultValue=0"
)

declare -a SYNC_UP_ALARM=(
  aws cloudwatch put-metric-alarm
  --region "$REGION"
  --alarm-name "teamver-design-${ENV_NAME}-s3-sync-up-failed"
  --namespace "Teamver/Design"
  --metric-name "TeamverDesignS3SyncUpFailed"
  --statistic Sum
  --period 300
  --evaluation-periods 1
  --threshold 1
  --comparison-operator GreaterThanOrEqualToThreshold
  --treat-missing-data notBreaching
)

declare -a USAGE_ALARM=(
  aws cloudwatch put-metric-alarm
  --region "$REGION"
  --alarm-name "teamver-design-${ENV_NAME}-usage-5xx"
  --namespace "Teamver/Design"
  --metric-name "TeamverDesignUsage5xx"
  --statistic Sum
  --period 300
  --evaluation-periods 1
  --threshold 5
  --comparison-operator GreaterThanOrEqualToThreshold
  --treat-missing-data notBreaching
)

declare -a SCRATCH_ALARM=(
  aws cloudwatch put-metric-alarm
  --region "$REGION"
  --alarm-name "teamver-design-${ENV_NAME}-scratch-disk-80pct"
  --namespace "CWAgent"
  --metric-name "disk_used_percent"
  --dimensions
    Name=InstanceId,Value="${INSTANCE_ID:-i-REPLACE}"
    Name=path,Value="$SCRATCH_PATH"
  --statistic Average
  --period 300
  --evaluation-periods 2
  --threshold 80
  --comparison-operator GreaterThanOrEqualToThreshold
  --treat-missing-data missing
)

declare -a SCRATCH_BYTES_FILTER=(
  aws logs put-metric-filter
  --region "$REGION"
  --log-group-name "$LOG_GROUP"
  --filter-name "teamver-design-${ENV_NAME}-scratch-disk-over-threshold"
  --filter-pattern '{ $.metric = "od_scratch_disk_usage" && $.overThreshold = true }'
  --metric-transformations
    "metricName=TeamverDesignScratchOverThreshold,metricNamespace=Teamver/Design,metricValue=1,defaultValue=0"
)

declare -a SCRATCH_BYTES_ALARM=(
  aws cloudwatch put-metric-alarm
  --region "$REGION"
  --alarm-name "teamver-design-${ENV_NAME}-scratch-over-threshold"
  --namespace "Teamver/Design"
  --metric-name "TeamverDesignScratchOverThreshold"
  --statistic Sum
  --period 300
  --evaluation-periods 1
  --threshold 1
  --comparison-operator GreaterThanOrEqualToThreshold
  --treat-missing-data notBreaching
)

if [[ ${#alarm_action_args[@]} -gt 0 ]]; then
  SYNC_UP_ALARM+=("${alarm_action_args[@]}")
  USAGE_ALARM+=("${alarm_action_args[@]}")
  SCRATCH_ALARM+=("${alarm_action_args[@]}")
  SCRATCH_BYTES_ALARM+=("${alarm_action_args[@]}")
fi

emit() {
  local label="$1"
  shift
  echo "# ${label}"
  printf '%q ' "$@"
  echo
  echo
}

run_or_emit() {
  local label="$1"
  shift
  if [[ "$APPLY" -eq 1 ]]; then
    echo "==> apply: $label"
    "$@"
    echo
  else
    emit "$label" "$@"
  fi
}

run_or_emit "1) Log metric filter: daemon S3 sync-up failures" "${SYNC_UP_FILTER[@]}"
run_or_emit "2) Log metric filter: design-api usage 5xx" "${USAGE_FILTER[@]}"
run_or_emit "3) Alarm: any sync-up failure in 5 minutes" "${SYNC_UP_ALARM[@]}"
run_or_emit "4) Alarm: usage 5xx burst (>=5 in 5 minutes)" "${USAGE_ALARM[@]}"
run_or_emit "5) Alarm template: scratch disk > 80% (requires CW Agent dimension Name/Value above)" "${SCRATCH_ALARM[@]}"
run_or_emit "6) Log metric filter: daemon scratch over threshold" "${SCRATCH_BYTES_FILTER[@]}"
run_or_emit "7) Alarm: scratch over threshold (any overThreshold:true in 5 minutes)" "${SCRATCH_BYTES_ALARM[@]}"

if [[ "$APPLY" -eq 0 ]]; then
  echo "# Tip: re-run with --apply to execute (requires aws CLI + IAM)."
fi
