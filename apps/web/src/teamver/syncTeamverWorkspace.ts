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
  options?: { preferredIdOverride?: string | null },
): Promise<string | null> {
  if (!session.authenticated) return null;

  const client = getDesignBffClient();
  const store = client?.workspaceStore as LocalStorageWorkspaceStore | null | undefined;
  if (!store) return null;

  const workspaces = workspacesInput ?? normalizeWorkspaceList(session.workspaces);
  const userId = readSessionUserId(session);

  const override = options?.preferredIdOverride?.trim() || null;
  const stored = (await store.get())?.trim() || null;
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
