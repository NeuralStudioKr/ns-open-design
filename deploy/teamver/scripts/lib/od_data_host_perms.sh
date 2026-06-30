#!/usr/bin/env bash
# Host bind mount for open-design-daemon — must match deploy/Dockerfile USER (1001:1001).
OD_DATA_CONTAINER_UID="${OD_DATA_CONTAINER_UID:-1001}"
OD_DATA_CONTAINER_GID="${OD_DATA_CONTAINER_GID:-1001}"

od_data_host_path_default() {
  echo "${OD_DATA_HOST_PATH:-/opt/teamver-design/od-data}"
}

fix_od_data_host_permissions() {
  local path="${1:-$(od_data_host_path_default)}"
  if [[ ! -d "$path" ]]; then
    echo "❌ OD data path missing: $path" >&2
    return 1
  fi
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "❌ fix_od_data_host_permissions requires root (sudo)" >&2
    return 1
  fi
  chown -R "${OD_DATA_CONTAINER_UID}:${OD_DATA_CONTAINER_GID}" "$path"
  chmod -R u+rwX,g+rwX "$path"
  echo "✓ $path → ${OD_DATA_CONTAINER_UID}:${OD_DATA_CONTAINER_GID} (open-design container user)"
}
