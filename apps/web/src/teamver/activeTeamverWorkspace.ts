import {
  fetchDesignAuthSession,
  getDesignBffClient,
} from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import { syncTeamverWorkspaceFromSession } from "./syncTeamverWorkspace";
import { normalizeWorkspaceList } from "./workspaceUtils";

/**
 * Active workspace for embed BFF/Drive/usage calls.
 *
 * Trust the embed-local store whenever it still exists on the session list.
 * Do not reconcile to `session.defaultWorkspaceId` on routine reads — that
 * account default often differs from the workspace the user is actively
 * working in and was firing `workspace-changed` mid-project (e.g. during the
 * first-turn question form), wiping the list and bouncing to home.
 *
 * Explicit workspace picks and parent-app switches go through
 * `setActiveTeamverWorkspace` / `syncTeamverWorkspaceFromSession` dispatch paths.
 */
export async function resolveActiveTeamverWorkspaceId(): Promise<string | null> {
  const client = getDesignBffClient();
  if (!client) return null;

  let session;
  try {
    session = await fetchDesignAuthSession();
  } catch {
    return null;
  }
  if (!session?.authenticated) return null;

  const workspaces = normalizeWorkspaceList(session.workspaces);
  const storeId = (await client.workspaceStore?.get())?.trim() || null;

  if (storeId && workspaces.some((workspace) => workspace.id === storeId)) {
    return storeId;
  }

  return (await syncTeamverWorkspaceFromSession(session, workspaces))?.trim() || null;
}

export async function resolveActiveTeamverWorkspaceIdForEmbed(): Promise<string | null> {
  if (!isTeamverEmbedMode()) return null;
  return resolveActiveTeamverWorkspaceId();
}

export async function requireActiveTeamverWorkspaceId(): Promise<string> {
  const workspaceId = await resolveActiveTeamverWorkspaceId();
  if (!workspaceId) throw new Error("teamver_workspace_required");
  return workspaceId;
}

/** Alias for embed call sites — session-reconciled active workspace. */
export async function readActiveTeamverWorkspaceId(): Promise<string | null> {
  return resolveActiveTeamverWorkspaceIdForEmbed();
}
