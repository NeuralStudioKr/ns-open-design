import { fetchTeamverWorkspacePermissions } from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import { isWorkspaceAppEnabled, readAppDisabledReason } from "./workspaceUtils";

export const TEAMVER_DESIGN_ACCESS_CHANGED_EVENT = "teamver-design-access-changed";

export type TeamverDesignAccessSnapshot = {
  workspaceId: string;
  appEnabled: boolean;
  appDisabledReason: string | null;
};

let snapshot: TeamverDesignAccessSnapshot | null = null;

function dispatchTeamverDesignAccessChanged(): void {
  if (typeof window === "undefined" || !snapshot) return;
  window.dispatchEvent(
    new CustomEvent<TeamverDesignAccessSnapshot>(TEAMVER_DESIGN_ACCESS_CHANGED_EVENT, {
      detail: snapshot,
    }),
  );
}

export function subscribeTeamverDesignAccessChanged(
  listener: (detail: TeamverDesignAccessSnapshot) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const custom = event as CustomEvent<TeamverDesignAccessSnapshot>;
    if (custom.detail?.workspaceId) listener(custom.detail);
  };
  window.addEventListener(TEAMVER_DESIGN_ACCESS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(TEAMVER_DESIGN_ACCESS_CHANGED_EVENT, handler);
}

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
  dispatchTeamverDesignAccessChanged();
}

export function readTeamverDesignAccessSnapshot(): TeamverDesignAccessSnapshot | null {
  return snapshot;
}

const DESIGN_DISABLED_MESSAGES: Record<string, string> = {
  app_disabled_globally:
    "Teamver Design 앱이 현재 비활성화되어 있습니다. 워크스페이스 관리자에게 문의하세요.",
  design_app_disabled:
    "이 워크스페이스에서는 Teamver Design을 사용할 수 없습니다.",
};

/** Embed — workspace Design 앱 비활성 시 사용자 메시지. */
export function formatTeamverDesignDisabledMessage(reason?: string | null): string {
  const key = reason?.trim();
  if (key && DESIGN_DISABLED_MESSAGES[key]) return DESIGN_DISABLED_MESSAGES[key];
  return "이 워크스페이스에서는 Teamver Design을 사용할 수 없습니다. 워크스페이스 관리자에게 문의하세요.";
}

/** Embed read/write surfaces (chat, import, publish) — false when Design app disabled. */
export function isTeamverEmbedDesignSurfaceEnabled(): boolean {
  if (!isTeamverEmbedMode()) return true;
  return readTeamverDesignAccessSnapshot()?.appEnabled ?? true;
}

/** Fast path from last session/workspace snapshot (fail-open when unknown). */
export function isTeamverDesignAppEnabled(workspaceId: string): boolean {
  const trimmed = workspaceId.trim();
  if (!trimmed || !snapshot || snapshot.workspaceId !== trimmed) return true;
  return snapshot.appEnabled;
}

/** Embed composer Drive import / Canvas handoff — BFF + workspace + Design app enabled. */
export function isTeamverEmbedDriveImportAllowed(params: {
  bffPresent: boolean;
  workspaceId: string | null | undefined;
  snapshotAppEnabled?: boolean;
}): boolean {
  if (!params.bffPresent) return false;
  const trimmed = params.workspaceId?.trim();
  if (!trimmed) return false;
  if (!isTeamverEmbedMode()) return true;
  const snapEnabled =
    params.snapshotAppEnabled ?? readTeamverDesignAccessSnapshot()?.appEnabled ?? true;
  if (!snapEnabled) return false;
  return isTeamverDesignAppEnabled(trimmed);
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
