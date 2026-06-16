import type { LocalStorageWorkspaceStore } from "@teamver/app-sdk";
import { getDesignBffClient, type DesignAuthSession } from "./designBffClient";

function readSessionUserId(session: DesignAuthSession): string | null {
  return session.user?.userId?.trim() || null;
}

function readDefaultWorkspaceFromSession(session: DesignAuthSession): string | null {
  const direct = session.defaultWorkspaceId?.trim();
  if (direct) return direct;

  const workspaces = session.workspaces ?? [];
  const accountDefault = workspaces.find((workspace) => workspace.isAccountDefaultWorkspace);
  const fromDefault = accountDefault?.id?.trim();
  if (fromDefault) return fromDefault;

  const first = workspaces[0]?.id?.trim();
  return first || null;
}

/**
 * Embed boot: seed `teamver_design_active_workspace_id` from SSO session so
 * registry, usage, and publish can send `X-Workspace-Id`.
 */
export async function syncTeamverWorkspaceFromSession(
  session: DesignAuthSession,
): Promise<string | null> {
  if (!session.authenticated) return null;

  const client = getDesignBffClient();
  const store = client?.workspaceStore as LocalStorageWorkspaceStore | null | undefined;
  if (!store) return null;

  const userId = readSessionUserId(session);
  const sessionDefault = readDefaultWorkspaceFromSession(session);

  let active = (await store.get())?.trim() || null;
  if (!active && userId && typeof store.getPreferredWorkspaceIdForBootstrap === "function") {
    active = store.getPreferredWorkspaceIdForBootstrap(userId)?.trim() || null;
  }
  if (!active && sessionDefault) {
    await store.set(sessionDefault);
    active = sessionDefault;
  }

  const resolved = active || sessionDefault;
  if (userId && resolved && typeof store.setLastForUser === "function") {
    store.setLastForUser(userId, resolved);
  }
  return resolved;
}
