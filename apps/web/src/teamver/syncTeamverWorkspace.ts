import type { LocalStorageWorkspaceStore, WorkspaceListItem } from "@teamver/app-sdk";
import { getDesignBffClient, type DesignAuthSession } from "./designBffClient";
import {
  normalizeWorkspaceList,
  pickDefaultWorkspaceId,
  readWorkspaceId,
} from "./workspaceUtils";

function readSessionUserId(session: DesignAuthSession): string | null {
  const user = session.user;
  return user?.userId?.trim() || (user as { user_id?: string } | null)?.user_id?.trim() || null;
}

/**
 * Embed boot: seed `teamver_design_active_workspace_id` from Main BE session/bootstrap.
 * Registry, usage, and publish send `X-Workspace-Id` from this store.
 */
export async function syncTeamverWorkspaceFromSession(
  session: DesignAuthSession,
  workspacesInput?: WorkspaceListItem[],
): Promise<string | null> {
  if (!session.authenticated) return null;

  const client = getDesignBffClient();
  const store = client?.workspaceStore as LocalStorageWorkspaceStore | null | undefined;
  if (!store) return null;

  const workspaces = workspacesInput ?? normalizeWorkspaceList(session.workspaces);
  const userId = readSessionUserId(session);

  let active = (await store.get())?.trim() || null;
  if (!active && userId && typeof store.getPreferredWorkspaceIdForBootstrap === "function") {
    active = store.getPreferredWorkspaceIdForBootstrap(userId)?.trim() || null;
  }

  const resolved = pickDefaultWorkspaceId(workspaces, {
    preferredId: active,
    defaultWorkspaceId: session.defaultWorkspaceId ?? null,
  });

  if (resolved && resolved !== active) {
    await store.set(resolved);
    active = resolved;
  } else if (!active && resolved) {
    await store.set(resolved);
    active = resolved;
  }

  if (userId && active && typeof store.setLastForUser === "function") {
    store.setLastForUser(userId, active);
  }

  return active || resolved;
}

export { readWorkspaceId };
