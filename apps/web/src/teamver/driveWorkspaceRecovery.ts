import {
  fetchDesignAuthSession,
  isDesignAuthRefreshDeclined,
  refreshDesignAuthCookie,
} from "./designBffClient";
import { syncTeamverWorkspaceFromSession } from "./syncTeamverWorkspace";

/**
 * Main `/api/v2/shared-drive` returns `403 {"message":"error.forbidden"}` at
 * `router_v2/shared_drive.py:_user_may_access_workspace` when the forwarded
 * `X-Workspace-Id` is not a workspace the (Main SSO) user belongs to.
 *
 * The three real-world triggers (all healed by full re-login) are:
 *
 *   1) Local `activeTeamverWorkspace` store holds a workspace_id that the user
 *      was removed from — session workspaces list already dropped it but
 *      `preserveStoredWorkspace: true` on focus refresh kept the stale ID.
 *   2) Cached `/auth/session` workspaces list still contains a workspace whose
 *      membership was revoked between login and the Drive open — Main workspace
 *      lookup hits the DB directly and disagrees.
 *   3) BFF Apps JWT and Main HS256 SSO cookie drifted apart (another tab logged
 *      into Main as a different user on the parent domain). Drive proxy forwards
 *      Main SSO Bearer + BFF-derived workspace → user mismatch → 403.
 *
 * Force a fresh session probe (bust the cached workspaces list) and let
 * `syncTeamverWorkspaceFromSession` reconcile the local store — dropping the
 * stored ID when the server truth no longer includes it. Callers listening on
 * the `workspace-changed` event will refetch; drive proxy retries with the
 * reconciled `X-Workspace-Id` once.
 *
 * Returns the new workspace_id when it differs from the caller-supplied value
 * (safe to retry the failing Drive request with it). Returns `null` when the
 * store did not change — case (3) or a real ACL denial, both of which need
 * explicit re-login and must not be transparently retried.
 */
export async function recoverStaleDriveWorkspace(
  currentWorkspaceId?: string | null,
): Promise<string | null> {
  const current = (currentWorkspaceId ?? "").trim() || null;

  // Soft/hard sticky: do not clear decline up-front (resets §17 cooldowns).
  // Only continue after the shared survival/soft ladder revives cookies.
  if (isDesignAuthRefreshDeclined()) {
    const revived = await refreshDesignAuthCookie();
    if (!revived) return null;
  }

  let session;
  try {
    session = await fetchDesignAuthSession({ force: true });
  } catch {
    return null;
  }
  if (!session?.authenticated) return null;

  let reconciled: string | null = null;
  try {
    reconciled = (
      await syncTeamverWorkspaceFromSession(session, undefined, {
        preserveStoredWorkspace: false,
      })
    )?.trim() || null;
  } catch {
    return null;
  }
  if (!reconciled) return null;
  if (current && reconciled === current) return null;
  return reconciled;
}
