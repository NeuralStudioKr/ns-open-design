#!/usr/bin/env bash
# Fix host bind mount ownership for open-design-daemon (UID 1001).
#
# Usage:
#   sudo bash scripts/fix_od_data_permissions.sh
#   sudo OD_DATA_HOST_PATH=/opt/teamver-design/od-data bash scripts/fix_od_data_permissions.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/od_data_host_perms.sh
source "$SCRIPT_DIR/lib/od_data_host_perms.sh"

fix_od_data_host_permissions "$(od_data_host_path_default)"
