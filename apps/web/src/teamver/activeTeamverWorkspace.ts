import {
  fetchDesignAuthSession,
  getDesignBffClient,
  readCachedDesignAuthSessionMeta,
} from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import { syncTeamverWorkspaceFromSession } from "./syncTeamverWorkspace";
import { readTeamverWorkspaceStoreRevisionMs } from "./teamverWorkspaceStoreRevision";
import { normalizeWorkspaceList, readWorkspaceId } from "./workspaceUtils";

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

  const storeId = (await client.workspaceStore?.get())?.trim() || null;

  let session;
  try {
    session = await fetchDesignAuthSession();
  } catch {
    // Session probe can fail while nginx auth_request still accepts the
    // Main BE cookie. Keep routing daemon calls with the persisted workspace
    // so preview/file reads do not lose X-Workspace-Id mid-run.
    return storeId;
  }
  // Session JSON can briefly read unauthenticated during idle refresh while the
  // persisted workspace and BFF cookies are still valid — same rationale as catch.
  if (!session?.authenticated) return storeId;

  const workspaces = normalizeWorkspaceList(session.workspaces);

  if (storeId && workspaces.some((workspace) => readWorkspaceId(workspace) === storeId)) {
    const defaultWorkspaceId = session.defaultWorkspaceId?.trim() || null;
    if (
      defaultWorkspaceId
      && storeId !== defaultWorkspaceId
      && workspaces.some((workspace) => readWorkspaceId(workspace) === defaultWorkspaceId)
    ) {
      const sessionMeta = readCachedDesignAuthSessionMeta();
      const embedRevision = readTeamverWorkspaceStoreRevisionMs();
      if (
        sessionMeta
        && sessionMeta.defaultWorkspaceId === defaultWorkspaceId
        && sessionMeta.fetchedAt > embedRevision
      ) {
        return (
          await syncTeamverWorkspaceFromSession(session, workspaces, {
            preferredIdOverride: defaultWorkspaceId,
            preserveStoredWorkspace: false,
          })
        )?.trim() || storeId;
      }
    }
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
