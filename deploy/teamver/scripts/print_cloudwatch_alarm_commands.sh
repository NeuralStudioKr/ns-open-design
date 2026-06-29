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
#   - log metric filter + alarm: daemon project-access upstream failures
#     (`teamver_project_access_5xx`)
#   - log metric filter + alarm: registry delete remote S3 purge partial failure
#     (`od_s3_remote_purged` + `$.failed > 0`)
#   - log metric filter + alarm: design-api DB connection 5xx
#     (`teamver_design_api_db_5xx`) — loop 138 RDS SSL incident detection
#   - log metric filter + alarm: registry scratch sync failed (design-api)
#     (`od_registry_scratch_sync_failed`)
#   - log metric filter + alarm: scratch evict deferred unsynced
#     (`od_scratch_evict_deferred_unsynced`)
#   - log metric filter + alarm: daemon S3 storage init failed
#     (`od_s3_storage_init_failed`)
#   - log metric filter + alarm: BYOK proxy begin failed (sync-down)
#     (`od_byok_proxy_begin_failed`)
#   - log metric filter + alarm: BYOK billing reconciliation orphan
#     (`od_byok_billing_orphan_usage`)
#   - EC2 cron/SSM: `verify_litestream_replica.sh` (S3 replica 객체 증적, P2-1)

set -euo pipefail

ENV_NAME="staging"
INSTANCE_ID="${INSTANCE_ID:-}"
LOG_GROUP="${LOG_GROUP:-}"
DESIGN_API_LOG_GROUP="${DESIGN_API_LOG_GROUP:-}"
SNS_TOPIC_ARN="${SNS_TOPIC_ARN:-}"
REGION="${AWS_REGION:-ap-northeast-2}"
SCRATCH_PATH="${SCRATCH_PATH:-/app/.od/scratch}"
LITESTREAM_LOG_GROUP="${LITESTREAM_LOG_GROUP:-}"
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
      LITESTREAM_LOG_GROUP="${LITESTREAM_LOG_GROUP:-/teamver/design/staging/litestream}"
      ;;
    --production)
      ENV_NAME="production"
      LOG_GROUP="${LOG_GROUP:-/teamver/design/prod/open-design-daemon}"
      DESIGN_API_LOG_GROUP="${DESIGN_API_LOG_GROUP:-/teamver/design/prod/design-api}"
      LITESTREAM_LOG_GROUP="${LITESTREAM_LOG_GROUP:-/teamver/design/prod/litestream}"
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

declare -a PROJECT_ACCESS_FILTER=(
  aws logs put-metric-filter
  --region "$REGION"
  --log-group-name "$LOG_GROUP"
  --filter-name "teamver-design-${ENV_NAME}-project-access-5xx"
  --filter-pattern '"teamver_project_access_5xx"'
  --metric-transformations
    "metricName=TeamverDesignProjectAccess5xx,metricNamespace=Teamver/Design,metricValue=1,defaultValue=0"
)

declare -a PROJECT_ACCESS_ALARM=(
  aws cloudwatch put-metric-alarm
  --region "$REGION"
  --alarm-name "teamver-design-${ENV_NAME}-project-access-5xx"
  --namespace "Teamver/Design"
  --metric-name "TeamverDesignProjectAccess5xx"
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

declare -a REMOTE_PURGE_FILTER=(
  aws logs put-metric-filter
  --region "$REGION"
  --log-group-name "$LOG_GROUP"
  --filter-name "teamver-design-${ENV_NAME}-s3-remote-purge-failed"
  --filter-pattern '{ $.metric = "od_s3_remote_purged" && $.failed > 0 }'
  --metric-transformations
    "metricName=TeamverDesignS3RemotePurgeFailed,metricNamespace=Teamver/Design,metricValue=1,defaultValue=0"
)

declare -a REMOTE_PURGE_ALARM=(
  aws cloudwatch put-metric-alarm
  --region "$REGION"
  --alarm-name "teamver-design-${ENV_NAME}-s3-remote-purge-failed"
  --namespace "Teamver/Design"
  --metric-name "TeamverDesignS3RemotePurgeFailed"
  --statistic Sum
  --period 300
  --evaluation-periods 1
  --threshold 1
  --comparison-operator GreaterThanOrEqualToThreshold
  --treat-missing-data notBreaching
)

# loop 138 incident — RDS SSL verify 가 design-api 를 죽였을 때 nginx 가
# 그대로 502 UPSTREAM_UNAVAILABLE 로 응답했다. design-api exception handler
# 가 503 + 구조화 JSON 마커를 emit 하므로 CW filter 로 즉시 잡는다.
declare -a DESIGN_API_DB_FILTER=(
  aws logs put-metric-filter
  --region "$REGION"
  --log-group-name "$DESIGN_API_LOG_GROUP"
  --filter-name "teamver-design-${ENV_NAME}-design-api-db-5xx"
  --filter-pattern '"teamver_design_api_db_5xx"'
  --metric-transformations
    "metricName=TeamverDesignApiDb5xx,metricNamespace=Teamver/Design,metricValue=1,defaultValue=0"
)

declare -a DESIGN_API_DB_ALARM=(
  aws cloudwatch put-metric-alarm
  --region "$REGION"
  --alarm-name "teamver-design-${ENV_NAME}-design-api-db-5xx"
  --namespace "Teamver/Design"
  --metric-name "TeamverDesignApiDb5xx"
  --statistic Sum
  --period 300
  --evaluation-periods 1
  --threshold 1
  --comparison-operator GreaterThanOrEqualToThreshold
  --treat-missing-data notBreaching
)

# Litestream sidecar — docker awslogs driver 로 LITESTREAM_LOG_GROUP 에 수집할 때만 유효.
declare -a LITESTREAM_ERROR_FILTER=(
  aws logs put-metric-filter
  --region "$REGION"
  --log-group-name "${LITESTREAM_LOG_GROUP:-/teamver/design/${ENV_NAME}/litestream}"
  --filter-name "teamver-design-${ENV_NAME}-litestream-error"
  --filter-pattern '?ERROR ?error ?"level=error" ?fatal'
  --metric-transformations
    "metricName=TeamverDesignLitestreamError,metricNamespace=Teamver/Design,metricValue=1,defaultValue=0"
)

declare -a LITESTREAM_ERROR_ALARM=(
  aws cloudwatch put-metric-alarm
  --region "$REGION"
  --alarm-name "teamver-design-${ENV_NAME}-litestream-error"
  --namespace "Teamver/Design"
  --metric-name "TeamverDesignLitestreamError"
  --statistic Sum
  --period 300
  --evaluation-periods 1
  --threshold 1
  --comparison-operator GreaterThanOrEqualToThreshold
  --treat-missing-data notBreaching
)

declare -a SCRATCH_EVICT_DEFERRED_FILTER=(
  aws logs put-metric-filter
  --region "$REGION"
  --log-group-name "$LOG_GROUP"
  --filter-name "teamver-design-${ENV_NAME}-scratch-evict-deferred-unsynced"
  --filter-pattern '"od_scratch_evict_deferred_unsynced"'
  --metric-transformations
    "metricName=TeamverDesignScratchEvictDeferredUnsynced,metricNamespace=Teamver/Design,metricValue=1,defaultValue=0"
)

declare -a SCRATCH_EVICT_DEFERRED_ALARM=(
  aws cloudwatch put-metric-alarm
  --region "$REGION"
  --alarm-name "teamver-design-${ENV_NAME}-scratch-evict-deferred-unsynced"
  --namespace "Teamver/Design"
  --metric-name "TeamverDesignScratchEvictDeferredUnsynced"
  --statistic Sum
  --period 300
  --evaluation-periods 1
  --threshold 1
  --comparison-operator GreaterThanOrEqualToThreshold
  --treat-missing-data notBreaching
)

declare -a S3_STORAGE_INIT_FAILED_FILTER=(
  aws logs put-metric-filter
  --region "$REGION"
  --log-group-name "$LOG_GROUP"
  --filter-name "teamver-design-${ENV_NAME}-s3-storage-init-failed"
  --filter-pattern '"od_s3_storage_init_failed"'
  --metric-transformations
    "metricName=TeamverDesignS3StorageInitFailed,metricNamespace=Teamver/Design,metricValue=1,defaultValue=0"
)

declare -a S3_STORAGE_INIT_FAILED_ALARM=(
  aws cloudwatch put-metric-alarm
  --region "$REGION"
  --alarm-name "teamver-design-${ENV_NAME}-s3-storage-init-failed"
  --namespace "Teamver/Design"
  --metric-name "TeamverDesignS3StorageInitFailed"
  --statistic Sum
  --period 300
  --evaluation-periods 1
  --threshold 1
  --comparison-operator GreaterThanOrEqualToThreshold
  --treat-missing-data notBreaching
)

declare -a REGISTRY_SCRATCH_SYNC_FAILED_FILTER=(
  aws logs put-metric-filter
  --region "$REGION"
  --log-group-name "$DESIGN_API_LOG_GROUP"
  --filter-name "teamver-design-${ENV_NAME}-registry-scratch-sync-failed"
  --filter-pattern '"od_registry_scratch_sync_failed"'
  --metric-transformations
    "metricName=TeamverDesignRegistryScratchSyncFailed,metricNamespace=Teamver/Design,metricValue=1,defaultValue=0"
)

declare -a REGISTRY_SCRATCH_SYNC_FAILED_ALARM=(
  aws cloudwatch put-metric-alarm
  --region "$REGION"
  --alarm-name "teamver-design-${ENV_NAME}-registry-scratch-sync-failed"
  --namespace "Teamver/Design"
  --metric-name "TeamverDesignRegistryScratchSyncFailed"
  --statistic Sum
  --period 300
  --evaluation-periods 1
  --threshold 1
  --comparison-operator GreaterThanOrEqualToThreshold
  --treat-missing-data notBreaching
)

# BYOK proxy fail-fast 트립 — sync-down 실패로 502 응답.
# 사용자 화면에 명확한 오류가 노출됨을 의미 → 5분 누적 ≥1 이면 즉시
# triage (S3 / tenant remote / network 점검).
declare -a BYOK_PROXY_BEGIN_FAILED_FILTER=(
  aws logs put-metric-filter
  --region "$REGION"
  --log-group-name "$LOG_GROUP"
  --filter-name "teamver-design-${ENV_NAME}-byok-proxy-begin-failed"
  --filter-pattern '"od_byok_proxy_begin_failed"'
  --metric-transformations
    "metricName=TeamverDesignByokProxyBeginFailed,metricNamespace=Teamver/Design,metricValue=1,defaultValue=0"
)

declare -a BYOK_PROXY_BEGIN_FAILED_ALARM=(
  aws cloudwatch put-metric-alarm
  --region "$REGION"
  --alarm-name "teamver-design-${ENV_NAME}-byok-proxy-begin-failed"
  --namespace "Teamver/Design"
  --metric-name "TeamverDesignByokProxyBeginFailed"
  --statistic Sum
  --period 300
  --evaluation-periods 1
  --threshold 3
  --comparison-operator GreaterThanOrEqualToThreshold
  --treat-missing-data notBreaching
)

# Daemon-side BYOK billing reconciliation orphan — proxy SSE 가 usage 를 emit
# 했지만 terminal message PUT 이 OD_BYOK_BILLING_STAGE_TTL_MS 안에 도착하지
# 않아 staged usage 가 reap 됨. 빈도가 낮아야 한다 (정상은 0). 누적되면
# FE message PUT 실패 또는 client 절단 패턴 의심.
declare -a BYOK_BILLING_ORPHAN_FILTER=(
  aws logs put-metric-filter
  --region "$REGION"
  --log-group-name "$LOG_GROUP"
  --filter-name "teamver-design-${ENV_NAME}-byok-billing-orphan"
  --filter-pattern '"od_byok_billing_orphan_usage"'
  --metric-transformations
    "metricName=TeamverDesignByokBillingOrphan,metricNamespace=Teamver/Design,metricValue=1,defaultValue=0"
)

declare -a BYOK_BILLING_ORPHAN_ALARM=(
  aws cloudwatch put-metric-alarm
  --region "$REGION"
  --alarm-name "teamver-design-${ENV_NAME}-byok-billing-orphan"
  --namespace "Teamver/Design"
  --metric-name "TeamverDesignByokBillingOrphan"
  --statistic Sum
  --period 900
  --evaluation-periods 1
  --threshold 1
  --comparison-operator GreaterThanOrEqualToThreshold
  --treat-missing-data notBreaching
)

if [[ ${#alarm_action_args[@]} -gt 0 ]]; then
  SYNC_UP_ALARM+=("${alarm_action_args[@]}")
  USAGE_ALARM+=("${alarm_action_args[@]}")
  PROJECT_ACCESS_ALARM+=("${alarm_action_args[@]}")
  SCRATCH_ALARM+=("${alarm_action_args[@]}")
  SCRATCH_BYTES_ALARM+=("${alarm_action_args[@]}")
  REMOTE_PURGE_ALARM+=("${alarm_action_args[@]}")
  DESIGN_API_DB_ALARM+=("${alarm_action_args[@]}")
  LITESTREAM_ERROR_ALARM+=("${alarm_action_args[@]}")
  SCRATCH_EVICT_DEFERRED_ALARM+=("${alarm_action_args[@]}")
  S3_STORAGE_INIT_FAILED_ALARM+=("${alarm_action_args[@]}")
  REGISTRY_SCRATCH_SYNC_FAILED_ALARM+=("${alarm_action_args[@]}")
  BYOK_PROXY_BEGIN_FAILED_ALARM+=("${alarm_action_args[@]}")
  BYOK_BILLING_ORPHAN_ALARM+=("${alarm_action_args[@]}")
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
run_or_emit "8) Log metric filter: daemon project-access upstream failures" "${PROJECT_ACCESS_FILTER[@]}"
run_or_emit "9) Alarm: project-access 5xx burst (≥5 in 5 minutes)" "${PROJECT_ACCESS_ALARM[@]}"
run_or_emit "10) Log metric filter: registry delete S3 purge partial failure" "${REMOTE_PURGE_FILTER[@]}"
run_or_emit "11) Alarm: S3 remote purge failed (any failed>0 in 5 minutes)" "${REMOTE_PURGE_ALARM[@]}"
run_or_emit "12) Log metric filter: design-api DB connection 5xx" "${DESIGN_API_DB_FILTER[@]}"
run_or_emit "13) Alarm: design-api DB 5xx (any in 5 minutes)" "${DESIGN_API_DB_ALARM[@]}"
run_or_emit "14) Log metric filter: Litestream errors (requires LITESTREAM_LOG_GROUP / awslogs)" "${LITESTREAM_ERROR_FILTER[@]}"
run_or_emit "15) Alarm: Litestream error log (any in 5 minutes)" "${LITESTREAM_ERROR_ALARM[@]}"
run_or_emit "16) Log metric filter: scratch evict deferred unsynced" "${SCRATCH_EVICT_DEFERRED_FILTER[@]}"
run_or_emit "17) Alarm: scratch evict deferred unsynced (any in 5 minutes)" "${SCRATCH_EVICT_DEFERRED_ALARM[@]}"
run_or_emit "18) Log metric filter: daemon S3 storage init failed" "${S3_STORAGE_INIT_FAILED_FILTER[@]}"
run_or_emit "19) Alarm: S3 storage init failed (any in 5 minutes)" "${S3_STORAGE_INIT_FAILED_ALARM[@]}"
run_or_emit "20) Log metric filter: registry scratch sync failed (design-api)" "${REGISTRY_SCRATCH_SYNC_FAILED_FILTER[@]}"
run_or_emit "21) Alarm: registry scratch sync failed (any in 5 minutes)" "${REGISTRY_SCRATCH_SYNC_FAILED_ALARM[@]}"
run_or_emit "22) Log metric filter: BYOK proxy begin failed (sync-down)" "${BYOK_PROXY_BEGIN_FAILED_FILTER[@]}"
run_or_emit "23) Alarm: BYOK proxy begin failed (>=3 in 5 minutes — surface-level data-loss prevention)" "${BYOK_PROXY_BEGIN_FAILED_ALARM[@]}"
run_or_emit "24) Log metric filter: BYOK billing orphan (TTL reaped without terminal PUT)" "${BYOK_BILLING_ORPHAN_FILTER[@]}"
run_or_emit "25) Alarm: BYOK billing orphan (any in 15 minutes — FE message PUT loss)" "${BYOK_BILLING_ORPHAN_ALARM[@]}"

if [[ "$APPLY" -eq 0 ]]; then
  echo "# Litestream S3 replica (P2-1): EC2에서 주기적으로"
  echo "#   bash scripts/verify_litestream_replica.sh --${ENV_NAME}"
  echo "# AWS Console: S3 → teamver-design-${ENV_NAME}-data → prefix litestream/app.sqlite/"
  echo "# Tip: re-run with --apply to execute (requires aws CLI + IAM)."
else
  echo "# Tip: re-run with --apply to execute (requires aws CLI + IAM)."
fi
