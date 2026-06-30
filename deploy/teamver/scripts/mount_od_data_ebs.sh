#!/usr/bin/env bash
# Format + mount Terraform od-data EBS at OD_DATA_HOST_PATH (default /opt/teamver-design/od-data).
#
# Why: user_data often runs before aws_volume_attachment completes, so nvme1n1 exists
# but was never formatted/mounted. Docker named volumes then fill root EBS.
#
# Usage:
#   bash scripts/mount_od_data_ebs.sh --dry-run
#   sudo bash scripts/mount_od_data_ebs.sh --apply
#   sudo bash scripts/mount_od_data_ebs.sh --boot   # systemd oneshot (idempotent)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/od_data_host_perms.sh
source "$SCRIPT_DIR/lib/od_data_host_perms.sh"
DEPLOY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

OD_DATA_HOST_PATH="${OD_DATA_HOST_PATH:-/opt/teamver-design/od-data}"
OD_DATA_DEVICE="${OD_DATA_DEVICE:-}"
DRY_RUN=false
APPLY=false
BOOT=false

usage() {
  cat <<EOF
Usage: $0 [--dry-run | --apply | --boot]

  --dry-run   Print device, fstab, mount plan (default)
  --apply     mkfs (if needed), fstab, mount, chown container uid 1001
  --boot      Idempotent mount for systemd (no mkfs unless OD_DATA_BOOT_FORMAT=1)

Env:
  OD_DATA_HOST_PATH   Mount point (default: /opt/teamver-design/od-data)
  OD_DATA_DEVICE      Force block device (default: auto nvme1n1/xvdf/sdf)
EOF
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --apply) APPLY=true ;;
    --boot) BOOT=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $arg" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ "$APPLY" != true && "$BOOT" != true ]]; then
  DRY_RUN=true
fi

run() {
  if [[ "$DRY_RUN" == true ]]; then
    echo "DRYRUN: $*"
  else
    echo "+ $*"
    "$@"
  fi
}

resolve_od_data_block_device() {
  if [[ -n "$OD_DATA_DEVICE" && -b "$OD_DATA_DEVICE" ]]; then
    echo "$OD_DATA_DEVICE"
    return 0
  fi
  local cand dev mount
  for cand in /dev/nvme1n1 /dev/nvme2n1 /dev/xvdf /dev/sdf; do
    [[ -b "$cand" ]] || continue
    case "$cand" in
      *nvme0n1*) continue ;;
    esac
    mount="$(lsblk -n -o MOUNTPOINT "$cand" 2>/dev/null | head -1 || true)"
    if [[ -z "$mount" ]]; then
      echo "$cand"
      return 0
    fi
  done
  return 1
}

device_has_filesystem() {
  local dev="$1"
  blkid "$dev" >/dev/null 2>&1
}

ensure_mount() {
  local dev="$1"
  run install -d -o ubuntu -g ubuntu -m 0755 "$(dirname "$OD_DATA_HOST_PATH")"
  run install -d -o ubuntu -g ubuntu -m 0755 "$OD_DATA_HOST_PATH"

  if device_has_filesystem "$dev"; then
    echo "✓ $dev already has a filesystem"
  elif [[ "$BOOT" == true && "${OD_DATA_BOOT_FORMAT:-0}" != "1" ]]; then
    echo "❌ $dev has no filesystem — run: sudo bash $SCRIPT_DIR/mount_od_data_ebs.sh --apply" >&2
    exit 1
  else
    echo "==> Formatting $dev as ext4 (first use)"
    run mkfs.ext4 -F -L teamver-design-od-data "$dev"
  fi

  local uuid fstab_line
  if [[ "$DRY_RUN" == true ]]; then
    uuid="<uuid-after-mkfs-or-blkid>"
  else
    uuid="$(blkid -s UUID -o value "$dev")"
  fi
  fstab_line="UUID=${uuid} ${OD_DATA_HOST_PATH} ext4 defaults,nofail 0 2"

  if [[ "$DRY_RUN" == true ]]; then
    echo "DRYRUN: append fstab: $fstab_line"
  elif ! grep -qF "$OD_DATA_HOST_PATH" /etc/fstab 2>/dev/null; then
    echo "$fstab_line" >> /etc/fstab
    echo "✓ added /etc/fstab entry"
  else
    echo "✓ /etc/fstab already references $OD_DATA_HOST_PATH"
  fi

  if mountpoint -q "$OD_DATA_HOST_PATH" 2>/dev/null; then
    echo "✓ already mounted: $OD_DATA_HOST_PATH"
  else
    run mount "$OD_DATA_HOST_PATH" || run mount "$dev" "$OD_DATA_HOST_PATH"
    echo "✓ mounted $dev → $OD_DATA_HOST_PATH"
  fi

  if [[ "$DRY_RUN" != true ]]; then
    fix_od_data_host_permissions "$OD_DATA_HOST_PATH"
    df -h "$OD_DATA_HOST_PATH"
  fi
}

main() {
  local dev
  if ! dev="$(resolve_od_data_block_device)"; then
    echo "❌ No unattached od-data block device found (expected nvme1n1 after Terraform attach)" >&2
    lsblk -f || true
    exit 1
  fi

  echo "==> od-data device: $dev"
  echo "==> mount point:   $OD_DATA_HOST_PATH"

  if [[ "$BOOT" == true || "$APPLY" == true ]]; then
    if [[ "$(id -u)" -ne 0 ]]; then
      echo "❌ --apply/--boot requires root (sudo)" >&2
      exit 1
    fi
  fi

  ensure_mount "$dev"
}

main
