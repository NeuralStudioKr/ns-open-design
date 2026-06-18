import { fetchTeamverWorkspacePermissions } from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import { isWorkspaceAppEnabled, readAppDisabledReason } from "./workspaceUtils";

export type TeamverDesignAccessSnapshot = {
  workspaceId: string;
  appEnabled: boolean;
  appDisabledReason: string | null;
};

let snapshot: TeamverDesignAccessSnapshot | null = null;

export function updateTeamverDesignAccessSnapshot(
  workspaceId: string,
  appEnabled: boolean,
  appDisabledReason: string | null,
): void {
  const trimmed = workspaceId.trim();
  if (!trimmed) return;
  snapshot = {
    workspaceId: trimmed,
    appEnabled,
    appDisabledReason: appDisabledReason?.trim() || null,
  };
}

export function readTeamverDesignAccessSnapshot(): TeamverDesignAccessSnapshot | null {
  return snapshot;
}

/** Fast path from last session/workspace snapshot (fail-open when unknown). */
export function isTeamverDesignAppEnabled(workspaceId: string): boolean {
  const trimmed = workspaceId.trim();
  if (!trimmed || !snapshot || snapshot.workspaceId !== trimmed) return true;
  return snapshot.appEnabled;
}

function readPermissionsAppEnabled(permissions: {
  appEnabled?: boolean;
} | null | undefined): boolean {
  return permissions?.appEnabled !== false;
}

function readPermissionsDisabledReason(permissions: {
  appDisabledReason?: string | null;
} | null | undefined): string | null {
  return permissions?.appDisabledReason?.trim() || null;
}

/** Sensitive embed actions (publish, usage) — permissions endpoint when available. */
export async function assertTeamverDesignAppEnabled(workspaceId: string): Promise<void> {
  if (!isTeamverEmbedMode()) return;

  const trimmed = workspaceId.trim();
  if (!trimmed) throw new Error("teamver_workspace_required");

  const permissions = await fetchTeamverWorkspacePermissions(trimmed);
  if (permissions) {
    const appEnabled = readPermissionsAppEnabled(permissions);
    const reason =
      readPermissionsDisabledReason(permissions) || "design_app_disabled";
    updateTeamverDesignAccessSnapshot(trimmed, appEnabled, reason);
    if (!appEnabled) throw new Error(reason);
    return;
  }

  if (!isTeamverDesignAppEnabled(trimmed)) {
    throw new Error(snapshot?.appDisabledReason || "design_app_disabled");
  }
}

export function snapshotFromWorkspace(
  workspaceId: string,
  workspace: Parameters<typeof isWorkspaceAppEnabled>[0],
): void {
  updateTeamverDesignAccessSnapshot(
    workspaceId,
    isWorkspaceAppEnabled(workspace),
    readAppDisabledReason(workspace),
  );
}
