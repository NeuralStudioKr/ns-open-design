import type { TeamverDrivePublishTarget } from "./drivePublishTargets";

const MAX_RECENT = 5;

function storageKey(workspaceId: string): string {
  return `teamver.drive.recentPublishTargets.${workspaceId.trim()}`;
}

function isValidTarget(value: unknown): value is TeamverDrivePublishTarget {
  if (!value || typeof value !== "object") return false;
  const row = value as TeamverDrivePublishTarget;
  return (
    typeof row.id === "string"
    && row.id.trim().length > 0
    && typeof row.label === "string"
    && typeof row.description === "string"
  );
}

/** Workspace-scoped recent publish destinations (loop 356 — publish picker step 7a). */
export function readRecentPublishTargets(workspaceId: string | null | undefined): TeamverDrivePublishTarget[] {
  const ws = workspaceId?.trim();
  if (!ws || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(ws));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidTarget).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function pushRecentPublishTarget(
  workspaceId: string | null | undefined,
  target: TeamverDrivePublishTarget | null | undefined,
): void {
  const ws = workspaceId?.trim();
  if (!ws || !target?.id?.trim() || typeof window === "undefined") return;
  try {
    const existing = readRecentPublishTargets(ws).filter((item) => item.id !== target.id);
    const next = [target, ...existing].slice(0, MAX_RECENT);
    window.localStorage.setItem(storageKey(ws), JSON.stringify(next));
  } catch {
    // private mode / quota — preference loss is harmless
  }
}
