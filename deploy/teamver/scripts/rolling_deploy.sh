#!/usr/bin/env bash
# Rolling deploy across multiple Design EC2 nodes (docs-teamver/39_1 Phase 4 · 39_4 §3).
#
# Run from Mac/CI (NOT on EC2). Builds happen on each host via SSH deploy.sh — see 39_4 §3.2.
#
# For each host in --hosts, in order:
#   1. `aws elbv2 deregister-targets` (drain in-flight SSE via
#      deregistration_delay configured on the target group — 39_2 §3.1).
#   2. Wait for the target state to reach draining/unused (not "healthy"),
#      giving live SSE clients time to reconnect elsewhere.
#   3. Run deploy.sh on the host via SSH (compose down+up latest image).
#   4. Verify /_nginx/health from the host locally (nginx→daemon path).
#   5. `aws elbv2 register-targets` and wait for `healthy`.
#   6. Move to the next host.
#
# `--dry-run` prints the aws / ssh commands without executing them so ops
# can inspect a plan before touching prod.
#
# Safety rails:
#   • Never runs against zero hosts.
#   • Requires --tg-arn OR --tg-name so a typo can't drain the wrong TG.
#   • Fails fast if a host's health check does not return 200 within the
#     deploy budget — remaining hosts stay untouched, keeping at least
#     one node in service.
#   • --dry-run stubs out `aws` and `ssh` entirely — no side effects.

set -euo pipefail

ENV_FLAG=""
TG_ARN=""
TG_NAME=""
AWS_REGION_ARG=""
HOSTS_RAW=""
SSH_KEY=""
SSH_OPTS_EXTRA=""
DRAIN_WAIT_SECONDS=60
HEALTHY_WAIT_SECONDS=180
REMOTE_DEPLOY_DIR="\$HOME/ns-open-design/deploy/teamver"
DRY_RUN=false
DEPLOY_SH_EXTRA=""
SKIP_LOCAL_HEALTH_CHECK=false

usage() {
  cat <<'EOF'
rolling_deploy.sh — Rolling deploy across Teamver Design EC2 nodes

Usage:
  bash scripts/rolling_deploy.sh --env staging --tg-arn <ARN> --hosts "ubuntu@1.2.3.4 ubuntu@5.6.7.8" --ssh-key ~/.k/xxx.pem
  bash scripts/rolling_deploy.sh --env production --tg-name teamver-design-prod-nginx-tg --hosts "..." --ssh-key ... --dry-run

Required:
  --env <staging|production>     .env file selection passed to deploy.sh
  --tg-arn <ARN>                 ALB target group ARN (terraform output alb_target_group_arn)
  --tg-name <NAME>               Alternative to --tg-arn — describe by name first.
  --hosts "u@h1 u@h2 …"          Space-separated SSH targets (order = rolling order)
  --ssh-key <path>               .pem for ssh -i

Optional:
  --region <ap-northeast-2>      AWS region (else AWS_REGION / AWS_DEFAULT_REGION)
  --ssh-opts "-o …"              Extra ssh flags (appended after -i/-o BatchMode)
  --drain-wait <sec>             Poll interval budget for target-drained (default 60s per host)
  --healthy-wait <sec>           Poll budget for target back to healthy (default 180s per host)
  --remote-deploy-dir <path>     Directory on host containing deploy.sh (default ~/ns-open-design/deploy/teamver)
  --deploy-extra "…"             Extra flags forwarded to deploy.sh (e.g. --rds --no-cache)
  --skip-local-health-check      Skip curl /_nginx/health from the host (rely on ALB re-registration)
  --dry-run                      Do not run aws / ssh — echo commands only
  -h | --help
EOF
}

while (( $# )); do
  case "$1" in
    --env) ENV_FLAG="${2:?--env requires staging|production}"; shift ;;
    --tg-arn) TG_ARN="${2:?--tg-arn requires a value}"; shift ;;
    --tg-name) TG_NAME="${2:?--tg-name requires a value}"; shift ;;
    --region) AWS_REGION_ARG="${2:?--region requires a value}"; shift ;;
    --hosts) HOSTS_RAW="${2:?--hosts requires a value}"; shift ;;
    --ssh-key) SSH_KEY="${2:?--ssh-key requires a value}"; shift ;;
    --ssh-opts) SSH_OPTS_EXTRA="${2:?--ssh-opts requires a value}"; shift ;;
    --drain-wait) DRAIN_WAIT_SECONDS="${2:?--drain-wait requires a value}"; shift ;;
    --healthy-wait) HEALTHY_WAIT_SECONDS="${2:?--healthy-wait requires a value}"; shift ;;
    --remote-deploy-dir) REMOTE_DEPLOY_DIR="${2:?--remote-deploy-dir requires a value}"; shift ;;
    --deploy-extra) DEPLOY_SH_EXTRA="${2:?--deploy-extra requires a value}"; shift ;;
    --skip-local-health-check) SKIP_LOCAL_HEALTH_CHECK=true ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "❌ unknown arg: $1" >&2; usage; exit 1 ;;
  esac
  shift
done

if [[ -z "$ENV_FLAG" ]]; then
  echo "❌ --env required (staging|production)" >&2; usage; exit 1
fi
if [[ "$ENV_FLAG" != "staging" && "$ENV_FLAG" != "production" ]]; then
  echo "❌ --env must be staging or production (got: $ENV_FLAG)" >&2; exit 1
fi

if [[ -z "$TG_ARN" && -z "$TG_NAME" ]]; then
  echo "❌ --tg-arn or --tg-name required (guard against wrong-TG drain)" >&2; exit 1
fi
if [[ -z "$HOSTS_RAW" ]]; then
  echo "❌ --hosts required (space-separated user@ip list)" >&2; exit 1
fi
if [[ -z "$SSH_KEY" ]]; then
  echo "❌ --ssh-key required (SSM path not supported yet)" >&2; exit 1
fi

# shellcheck disable=SC2206
HOSTS=( $HOSTS_RAW )
if (( ${#HOSTS[@]} == 0 )); then
  echo "❌ --hosts parsed to zero entries" >&2; exit 1
fi

REGION="${AWS_REGION_ARG:-${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-2}}}"

run() {
  if [[ "$DRY_RUN" == true ]]; then
    printf 'DRYRUN:'
    for arg in "$@"; do printf ' %q' "$arg"; done
    printf '\n'
  else
    "$@"
  fi
}

run_capture() {
  # Same as run but returns stdout for parsing. In dry-run we emit a
  # deterministic stub so the caller can still branch.
  if [[ "$DRY_RUN" == true ]]; then
    printf 'DRYRUN:'
    for arg in "$@"; do printf ' %q' "$arg"; done
    printf '\n' >&2
    echo "DRYRUN_STUB"
  else
    "$@"
  fi
}

resolve_tg_arn() {
  if [[ -n "$TG_ARN" ]]; then
    return
  fi
  echo "==> Resolving target group ARN by name: $TG_NAME (region=$REGION)"
  if [[ "$DRY_RUN" == true ]]; then
    TG_ARN="arn:aws:elasticloadbalancing:${REGION}:000000000000:targetgroup/${TG_NAME}/dryrun"
    echo "    DRYRUN: TG_ARN=$TG_ARN"
    return
  fi
  TG_ARN="$(
    aws elbv2 describe-target-groups \
      --names "$TG_NAME" \
      --region "$REGION" \
      --query 'TargetGroups[0].TargetGroupArn' \
      --output text
  )"
  if [[ -z "$TG_ARN" || "$TG_ARN" == "None" ]]; then
    echo "❌ could not resolve target group '$TG_NAME' in $REGION" >&2
    exit 1
  fi
  echo "    TG_ARN=$TG_ARN"
}

resolve_target_id_for_host() {
  # host looks like "user@ip" — we send the ip's private/public tuple to
  # aws elbv2 describe-target-health and pick the target id whose
  # AvailabilityZone-adjusted IP matches. For simplicity we accept EC2
  # instance id via --hosts of the form "user@i-abcdef" too. When the
  # host is an IP, look up the instance id via aws ec2 describe-instances.
  local host="$1"
  local hostpart="${host#*@}"

  if [[ "$hostpart" == i-* ]]; then
    echo "$hostpart"
    return
  fi

  if [[ "$DRY_RUN" == true ]]; then
    echo "i-dryrun-${hostpart//[^a-zA-Z0-9]/-}"
    return
  fi

  local instance_id
  instance_id="$(
    aws ec2 describe-instances \
      --region "$REGION" \
      --filters "Name=network-interface.addresses.private-ip-address,Values=${hostpart}" \
                "Name=network-interface.addresses.association.public-ip,Values=${hostpart}" \
      --query 'Reservations[].Instances[].InstanceId' \
      --output text 2>/dev/null | head -n1
  )"
  if [[ -z "$instance_id" || "$instance_id" == "None" ]]; then
    # Try each filter alone (AWS CLI requires OR through separate calls).
    for key in private-ip-address association.public-ip; do
      instance_id="$(
        aws ec2 describe-instances \
          --region "$REGION" \
          --filters "Name=network-interface.addresses.${key},Values=${hostpart}" \
          --query 'Reservations[].Instances[].InstanceId' \
          --output text 2>/dev/null | head -n1
      )"
      if [[ -n "$instance_id" && "$instance_id" != "None" ]]; then
        break
      fi
    done
  fi
  if [[ -z "$instance_id" || "$instance_id" == "None" ]]; then
    echo "❌ could not resolve instance id for host $hostpart" >&2
    exit 1
  fi
  echo "$instance_id"
}

deregister_target() {
  local target_id="$1"
  echo "==> deregister $target_id from $TG_ARN"
  run aws elbv2 deregister-targets \
    --target-group-arn "$TG_ARN" \
    --targets "Id=$target_id" \
    --region "$REGION"
}

wait_target_drained() {
  local target_id="$1"
  local deadline=$(( $(date +%s) + DRAIN_WAIT_SECONDS ))
  echo "==> waiting for $target_id to reach draining/unused (up to ${DRAIN_WAIT_SECONDS}s)"
  while :; do
    if [[ "$DRY_RUN" == true ]]; then
      echo "    DRYRUN: assume drained after 0s"
      return 0
    fi
    local state
    state="$(
      aws elbv2 describe-target-health \
        --target-group-arn "$TG_ARN" \
        --targets "Id=$target_id" \
        --region "$REGION" \
        --query 'TargetHealthDescriptions[0].TargetHealth.State' \
        --output text 2>/dev/null || echo unknown
    )"
    if [[ "$state" == "draining" || "$state" == "unused" || "$state" == "None" ]]; then
      echo "    state=$state → drained"
      return 0
    fi
    if (( $(date +%s) > deadline )); then
      echo "❌ target $target_id did not drain within ${DRAIN_WAIT_SECONDS}s (last state=$state)" >&2
      return 1
    fi
    sleep 5
  done
}

register_target() {
  local target_id="$1"
  echo "==> register $target_id back into $TG_ARN"
  run aws elbv2 register-targets \
    --target-group-arn "$TG_ARN" \
    --targets "Id=$target_id" \
    --region "$REGION"
}

wait_target_healthy() {
  local target_id="$1"
  local deadline=$(( $(date +%s) + HEALTHY_WAIT_SECONDS ))
  echo "==> waiting for $target_id to reach healthy (up to ${HEALTHY_WAIT_SECONDS}s)"
  while :; do
    if [[ "$DRY_RUN" == true ]]; then
      echo "    DRYRUN: assume healthy after 0s"
      return 0
    fi
    local state
    state="$(
      aws elbv2 describe-target-health \
        --target-group-arn "$TG_ARN" \
        --targets "Id=$target_id" \
        --region "$REGION" \
        --query 'TargetHealthDescriptions[0].TargetHealth.State' \
        --output text 2>/dev/null || echo unknown
    )"
    if [[ "$state" == "healthy" ]]; then
      echo "    state=$state"
      return 0
    fi
    if (( $(date +%s) > deadline )); then
      echo "❌ target $target_id did not reach healthy within ${HEALTHY_WAIT_SECONDS}s (last state=$state)" >&2
      return 1
    fi
    sleep 5
  done
}

ssh_run() {
  local host="$1"
  local remote_cmd="$2"
  local -a ssh_args
  ssh_args=(
    -i "$SSH_KEY"
    -o BatchMode=yes
    -o StrictHostKeyChecking=accept-new
    -o ConnectTimeout=10
  )
  if [[ -n "$SSH_OPTS_EXTRA" ]]; then
    # shellcheck disable=SC2206
    local extra_opts=( $SSH_OPTS_EXTRA )
    ssh_args+=( "${extra_opts[@]}" )
  fi
  ssh_args+=( "$host" "bash -lc $(printf '%q' "$remote_cmd")" )
  run ssh "${ssh_args[@]}"
}

deploy_on_host() {
  local host="$1"
  local remote_cmd
  # We rely on the remote checkout already having the latest git state
  # (rolling_deploy does not run git pull for us). Ops that also want a
  # git pull should extend --deploy-extra or wrap this script.
  remote_cmd="cd ${REMOTE_DEPLOY_DIR} && bash deploy.sh --${ENV_FLAG}${DEPLOY_SH_EXTRA:+ ${DEPLOY_SH_EXTRA}}"
  echo "==> deploy on $host: $remote_cmd"
  ssh_run "$host" "$remote_cmd"
}

host_local_health_check() {
  if [[ "$SKIP_LOCAL_HEALTH_CHECK" == true ]]; then
    echo "    skipping host-local health check (--skip-local-health-check)"
    return 0
  fi
  local host="$1"
  local probe="curl -sSf -m 5 http://127.0.0.1/_nginx/health >/dev/null"
  echo "==> health probe on $host: $probe"
  ssh_run "$host" "$probe"
}

resolve_tg_arn

echo
echo "==> Rolling deploy plan"
echo "    env=$ENV_FLAG  region=$REGION  target_group=$TG_ARN"
echo "    hosts (${#HOSTS[@]}): ${HOSTS[*]}"
echo "    ssh-key=$SSH_KEY  deploy-extra=${DEPLOY_SH_EXTRA:-<none>}"
echo "    drain-wait=${DRAIN_WAIT_SECONDS}s  healthy-wait=${HEALTHY_WAIT_SECONDS}s"
if [[ "$DRY_RUN" == true ]]; then echo "    DRY_RUN"; fi
echo

for host in "${HOSTS[@]}"; do
  echo "───────────────────────────────────────────────────────────────"
  echo "[host] $host"
  target_id="$(resolve_target_id_for_host "$host")"
  echo "    target_id=$target_id"

  deregister_target "$target_id"
  wait_target_drained "$target_id"
  deploy_on_host "$host"
  host_local_health_check "$host"
  register_target "$target_id"
  wait_target_healthy "$target_id"
  echo "✓ $host rolled successfully"
done

echo
echo "✓ All ${#HOSTS[@]} hosts rolled through env=$ENV_FLAG"
