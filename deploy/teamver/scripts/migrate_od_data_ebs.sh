#!/usr/bin/env bash
# One-shot: mount od-data EBS, migrate Docker named volume → bind mount, reclaim root disk.
#
# Run on Design EC2 (staging/production) when df / is ~full and od-data EBS is unattached.
#
# Usage:
#   cd ~/neural/ns-open-design/deploy/teamver
#   bash scripts/migrate_od_data_ebs.sh --dry-run --staging
#   bash scripts/migrate_od_data_ebs.sh --apply --staging
#   bash scripts/migrate_od_data_ebs.sh --apply --production
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$DEPLOY_ROOT"

# shellcheck source=scripts/lib/design_compose.sh
source "$SCRIPT_DIR/lib/design_compose.sh"

ENV_FILE=""
DRY_RUN=true
APPLY=false
OD_DATA_HOST_PATH="${OD_DATA_HOST_PATH:-/opt/teamver-design/od-data}"

usage() {
  cat <<EOF
Usage: $0 [--dry-run | --apply] (--staging | --production)

Steps:
  1. Format+mount nvme1n1 → \$OD_DATA_HOST_PATH (default /opt/teamver-design/od-data)
  2. docker compose down
  3. Copy teamver-open-design_teamver_od_data → bind mount dir
  4. Set OD_DATA_HOST_PATH in .env.staging|.env.production
  5. docker image/build cache prune (root EBS)
  6. docker compose up (bind mount — data off root)
EOF
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true; APPLY=false ;;
    --apply) APPLY=true; DRY_RUN=false ;;
    --staging) ENV_FILE=".env.staging" ;;
    --production) ENV_FILE=".env.production" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $arg" >&2; usage >&2; exit 1 ;;
  esac
done

[[ -n "$ENV_FILE" ]] || { echo "❌ --staging or --production required" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "❌ missing $ENV_FILE" >&2; exit 1; }

run() {
  if [[ "$DRY_RUN" == true ]]; then
    echo "DRYRUN: $*"
  else
    echo "+ $*"
    "$@"
  fi
}

design_compose_build_args "$DEPLOY_ROOT" "$ENV_FILE"
COMPOSE=("${DESIGN_COMPOSE_ARGS[@]}")
PROJECT="$(design_compose_project_name)"
LEGACY_VOL="${PROJECT}_teamver_od_data"

ensure_env_od_data_host_path() {
  if grep -q '^OD_DATA_HOST_PATH=' "$ENV_FILE" 2>/dev/null; then
    if [[ "$DRY_RUN" == true ]]; then
      echo "DRYRUN: sed update OD_DATA_HOST_PATH in $ENV_FILE"
    else
      if grep -q "^OD_DATA_HOST_PATH=${OD_DATA_HOST_PATH}$" "$ENV_FILE"; then
        echo "✓ $ENV_FILE already has OD_DATA_HOST_PATH"
      else
        sed -i.bak "s|^OD_DATA_HOST_PATH=.*|OD_DATA_HOST_PATH=${OD_DATA_HOST_PATH}|" "$ENV_FILE" \
          || echo "OD_DATA_HOST_PATH=${OD_DATA_HOST_PATH}" >> "$ENV_FILE"
        echo "✓ set OD_DATA_HOST_PATH in $ENV_FILE"
      fi
    fi
  else
    run bash -c "echo 'OD_DATA_HOST_PATH=${OD_DATA_HOST_PATH}' >> '$ENV_FILE'"
  fi
}

copy_legacy_volume() {
  local src=""
  if docker volume inspect "$LEGACY_VOL" >/dev/null 2>&1; then
    src="$(docker volume inspect "$LEGACY_VOL" -f '{{.Mountpoint}}')"
  else
    echo "○ no legacy volume $LEGACY_VOL — fresh bind mount"
    return 0
  fi

  echo "==> legacy volume: $src"
  local used
  used="$(sudo du -sh "$src" 2>/dev/null | awk '{print $1}' || echo '?')"
  echo "    size: $used"

  if [[ "$DRY_RUN" == true ]]; then
    echo "DRYRUN: rsync -a $src/ → $OD_DATA_HOST_PATH/"
    return 0
  fi

  run sudo rsync -a "$src/" "${OD_DATA_HOST_PATH}/"
  run sudo chown -R ubuntu:ubuntu "$OD_DATA_HOST_PATH"
  echo "✓ migrated legacy volume → $OD_DATA_HOST_PATH"
}

reclaim_root_disk() {
  echo "==> reclaiming Docker root disk (images + build cache)"
  if [[ "$DRY_RUN" == true ]]; then
    docker system df || true
    echo "DRYRUN: docker image prune -a -f && docker builder prune -a -f"
    echo "DRYRUN: sudo journalctl --vacuum-size=200M"
    return 0
  fi
  docker system df || true
  docker image prune -a -f || true
  docker builder prune -a -f || true
  sudo journalctl --vacuum-size=200M 2>/dev/null || true
  df -h /
}

install_boot_mount_unit() {
  if [[ "$DRY_RUN" == true ]]; then
    echo "DRYRUN: install systemd teamver-design-od-data.mount.service → $SCRIPT_DIR/mount_od_data_ebs.sh --boot"
    return 0
  fi
  sudo tee /etc/systemd/system/teamver-design-od-data.mount.service >/dev/null <<EOF
[Unit]
Description=Mount Teamver Design od-data EBS
After=local-fs-pre.target
Before=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
Environment=OD_DATA_HOST_PATH=${OD_DATA_HOST_PATH}
ExecStart=/bin/bash ${SCRIPT_DIR}/mount_od_data_ebs.sh --boot

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable teamver-design-od-data.mount.service
  echo "✓ enabled boot mount unit"
}

main() {
  echo "==> migrate od-data EBS ($ENV_FILE)"
  df -h / || true
  lsblk -f || true

  if [[ "$APPLY" == true ]]; then
    sudo OD_DATA_HOST_PATH="$OD_DATA_HOST_PATH" bash "$SCRIPT_DIR/mount_od_data_ebs.sh" --apply
  else
    bash "$SCRIPT_DIR/mount_od_data_ebs.sh" --dry-run
  fi

  echo "==> stopping compose stack"
  run "${COMPOSE[@]}" down || true

  copy_legacy_volume
  ensure_env_od_data_host_path
  reclaim_root_disk
  install_boot_mount_unit

  echo "==> starting compose with bind mount"
  if [[ "$DRY_RUN" == true ]]; then
    echo "DRYRUN: bash deploy.sh $(design_compose_env_flag)"
    echo ""
    echo "After --apply, verify:"
    echo "  df -h / $OD_DATA_HOST_PATH"
    echo "  docker exec open-design-daemon du -sh /app/.od/scratch /app/.od/app.sqlite"
    exit 0
  fi

  bash "$DEPLOY_ROOT/deploy.sh" "$(design_compose_env_flag)" --rds --skip-validate

  echo ""
  echo "==> post-check"
  df -h / "$OD_DATA_HOST_PATH"
  docker system df || true

  if docker volume inspect "$LEGACY_VOL" >/dev/null 2>&1; then
    echo "○ legacy volume $LEGACY_VOL still exists — remove after smoke test:"
    echo "    docker volume rm $LEGACY_VOL"
  fi
  echo "✓ migration complete"
}

main
