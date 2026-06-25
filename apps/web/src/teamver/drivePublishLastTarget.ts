import type { TeamverDrivePublishTarget } from "./drivePublishTargets";

/**
 * loop 176 — Always-available default destination so publish never deadlocks
 * when the workspace bridge or `listTeamverDrivePublishTargets` fail.
 */
export const DEFAULT_PUBLISH_TARGET: TeamverDrivePublishTarget = {
  id: "personal-default",
  label: "내 드라이브",
  description: "기본 드라이브 위치",
  folderId: null,
  sharedDriveId: null,
};

export function ensureDefaultPublishTarget(
  targets: readonly TeamverDrivePublishTarget[],
): TeamverDrivePublishTarget[] {
  if (targets.length === 0) return [DEFAULT_PUBLISH_TARGET];
  if (targets.some((target) => target.folderId == null && target.sharedDriveId == null)) {
    return [...targets];
  }
  return [DEFAULT_PUBLISH_TARGET, ...targets];
}

/** Workspace + project scoped last publish destination (loop 174). */
export function lastPublishTargetStorageKey(
  workspaceId: string | null,
  projectId: string,
): string | null {
  const ws = workspaceId?.trim();
  const proj = projectId.trim();
  if (!ws || !proj) return null;
  return `teamver.drive.lastPublishTarget.${ws}.${proj}`;
}

export function readLastPublishTargetId(
  workspaceId: string | null,
  projectId: string,
): string | null {
  if (typeof window === "undefined") return null;
  const key = lastPublishTargetStorageKey(workspaceId, projectId);
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLastPublishTargetId(
  workspaceId: string | null,
  projectId: string,
  targetId: string | null,
): void {
  if (typeof window === "undefined") return;
  const key = lastPublishTargetStorageKey(workspaceId, projectId);
  if (!key) return;
  try {
    if (!targetId) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, targetId);
  } catch {
    // Private mode / quota — preference loss is harmless.
  }
}

export function resolvePublishTargetById(
  targets: readonly TeamverDrivePublishTarget[],
  targetId: string | null | undefined,
): TeamverDrivePublishTarget | null {
  const id = targetId?.trim();
  if (!id) return null;
  return targets.find((target) => target.id === id) ?? null;
}
