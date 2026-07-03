import type { LocalStorageWorkspaceStore, WorkspaceListItem } from "@teamver/app-sdk";
import { getDesignBffClient, type DesignAuthSession } from "./designBffClient";
import { dispatchTeamverWorkspaceChanged } from "./teamverWorkspaceEvents";
import {
  normalizeWorkspaceList,
  pickDefaultWorkspaceId,
  readWorkspaceId,
} from "./workspaceUtils";

function readSessionUserId(session: DesignAuthSession): string | null {
  return session.user?.userId?.trim() || null;
}

/**
 * Embed boot: seed `teamver_design_active_workspace_id` from Main BE session/bootstrap.
 * Registry, usage, and publish send `X-Workspace-Id` from this store.
 */
export async function syncTeamverWorkspaceFromSession(
  session: DesignAuthSession,
  workspacesInput?: WorkspaceListItem[],
  options?: {
    preferredIdOverride?: string | null;
    /**
     * Routine focus/idle session refresh must not silently reroute the whole
     * embed when the currently-stored workspace still exists in the session.
     * When `true`, we keep `stored` as long as it is present in the workspace
     * list (even if temporarily disabled) instead of falling through to
     * `pickDefaultWorkspaceId` which may pick a different enabled workspace.
     *
     * Boot and explicit auth recovery pass `false` so a legitimately revoked
     * workspace still gets reconciled onto a valid one.
     */
    preserveStoredWorkspace?: boolean;
  },
): Promise<string | null> {
  if (!session.authenticated) return null;

  const client = getDesignBffClient();
  const store = client?.workspaceStore as LocalStorageWorkspaceStore | null | undefined;
  if (!store) return null;

  const workspaces = workspacesInput ?? normalizeWorkspaceList(session.workspaces);
  const userId = readSessionUserId(session);

  const override = options?.preferredIdOverride?.trim() || null;
  const stored = (await store.get())?.trim() || null;

  // Focus/idle refresh — honour the stored workspace whenever it still
  // exists on the session so tab-focus does not fake a workspace switch.
  if (options?.preserveStoredWorkspace && !override && stored) {
    const storedStillPresent = workspaces.some(
      (workspace) => workspace.id === stored,
    );
    if (storedStillPresent) {
      if (userId && typeof store.setLastForUser === "function") {
        store.setLastForUser(userId, stored);
      }
      return stored;
    }
  }

  let active = override || stored || null;
  if (!active && userId && typeof store.getPreferredWorkspaceIdForBootstrap === "function") {
    active = store.getPreferredWorkspaceIdForBootstrap(userId)?.trim() || null;
  }

  const resolved = pickDefaultWorkspaceId(workspaces, {
    preferredId: active,
    defaultWorkspaceId: session.defaultWorkspaceId ?? null,
  });

  if (resolved && resolved !== stored) {
    await store.set(resolved);
    active = resolved;
    dispatchTeamverWorkspaceChanged(resolved);
  } else if (!stored && resolved) {
    await store.set(resolved);
    active = resolved;
    dispatchTeamverWorkspaceChanged(resolved);
  } else if (resolved) {
    active = resolved;
  }

  if (userId && active && typeof store.setLastForUser === "function") {
    store.setLastForUser(userId, active);
  }

  return active || resolved;
}

export { readWorkspaceId };
