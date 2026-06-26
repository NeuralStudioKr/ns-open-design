import {
  fetchDesignAuthSession,
  getDesignBffClient,
  readCachedDesignAuthSessionMeta,
} from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import { syncTeamverWorkspaceFromSession } from "./syncTeamverWorkspace";
import { readTeamverWorkspaceStoreRevisionMs } from "./teamverWorkspaceStoreRevision";
import { normalizeWorkspaceList } from "./workspaceUtils";

function shouldReconcileStoreWithSession(args: {
  storeId: string;
  sessionDefault: string | null;
  sessionFetchedAt: number;
  storeRevisionMs: number;
}): boolean {
  const { storeId, sessionDefault, sessionFetchedAt, storeRevisionMs } = args;
  if (!sessionDefault || sessionDefault === storeId) return false;
  // Embed workspace picker wrote the store after the session snapshot — trust the pick.
  if (storeRevisionMs >= sessionFetchedAt) return false;
  return true;
}

/**
 * Active workspace for embed BFF/Drive/usage calls.
 * Reconciles localStorage with session default when the parent app switched
 * workspaces before the embed store caught up (A-G3 / loop 425).
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
  const sessionDefault = (session.defaultWorkspaceId ?? "").trim() || null;
  const sessionMeta = readCachedDesignAuthSessionMeta();
  const sessionFetchedAt = sessionMeta?.fetchedAt ?? Date.now();
  const storeRevisionMs = readTeamverWorkspaceStoreRevisionMs();

  if (
    storeId &&
    workspaces.some((workspace) => workspace.id === storeId) &&
    !shouldReconcileStoreWithSession({
      storeId,
      sessionDefault,
      sessionFetchedAt,
      storeRevisionMs,
    })
  ) {
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
