import { fetchDesignAuthSession, getDesignBffClient } from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import { syncTeamverWorkspaceFromSession } from "./syncTeamverWorkspace";

/**
 * Active workspace for embed BFF/Drive calls — localStorage store first, then
 * session bootstrap. Avoids UI/store drift (loop 365).
 */
export async function resolveActiveTeamverWorkspaceId(): Promise<string | null> {
  const client = getDesignBffClient();
  if (!client) return null;

  let workspaceId = (await client.workspaceStore?.get())?.trim() || null;
  if (workspaceId) return workspaceId;

  let session;
  try {
    session = await fetchDesignAuthSession();
  } catch {
    return null;
  }
  if (!session?.authenticated) return null;
  workspaceId = (await syncTeamverWorkspaceFromSession(session))?.trim() || null;
  return workspaceId || null;
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

/** Alias for embed call sites — store first, session bootstrap fallback. */
export async function readActiveTeamverWorkspaceId(): Promise<string | null> {
  return resolveActiveTeamverWorkspaceIdForEmbed();
}
