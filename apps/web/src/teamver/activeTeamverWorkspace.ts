import {
  fetchDesignAuthSession,
  getDesignBffClient,
  isDesignAuthRefreshDeclined,
} from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import { syncTeamverWorkspaceFromSession } from "./syncTeamverWorkspace";
import { normalizeWorkspaceList, readWorkspaceId } from "./workspaceUtils";

/**
 * Active workspace for embed BFF/Drive/usage calls.
 *
 * Trust the embed-local store whenever it still exists on the session list.
 * Do not reconcile to `session.defaultWorkspaceId` on routine reads — that
 * account default often differs from the workspace the user is actively
 * working in. Hard refresh used to re-fetch `/auth/session` (new `fetchedAt`)
 * and snap back to the account default, wiping the user's explicit pick.
 *
 * Explicit workspace picks and parent-app switches go through
 * `setActiveTeamverWorkspace` / `syncTeamverWorkspaceFromSession` dispatch paths
 * (URL `workspace_id` / preferredIdOverride on boot).
 */
export async function resolveActiveTeamverWorkspaceId(): Promise<string | null> {
  const client = getDesignBffClient();
  if (!client) return null;

  const storeId = (await client.workspaceStore?.get())?.trim() || null;

  // Soft/hard sticky: C1 owns recovery. Routine workspace resolve must not
  // re-hit `/auth/session` (ensure) and reset sticky cooldowns.
  if (isDesignAuthRefreshDeclined()) return storeId;

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
