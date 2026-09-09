/**
 * Synchronous view of the active workspace id (0908-N01 slice G).
 *
 * `client.workspaceStore.get()` returns a promise, so callers that must decide
 * *within the current tick* cannot use it. `beginProjectListRequest` is the
 * motivating case: it stamps each project-list request with the workspace it
 * belongs to, and before boot filled `embedActiveWorkspaceIdRef` that stamp was
 * `null` — which made the staleness check unconditionally false, so a boot-time
 * request could never be invalidated by a workspace change.
 *
 * `designBffClient` configures the SDK store with this same key, so the
 * snapshot cannot drift from what the store writes.
 */
export const TEAMVER_ACTIVE_WORKSPACE_STORAGE_KEY = "teamver_design_active_workspace_id";

export function readTeamverActiveWorkspaceIdSnapshot(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(TEAMVER_ACTIVE_WORKSPACE_STORAGE_KEY)?.trim() || null;
  } catch {
    // Hardened embed contexts can deny localStorage entirely.
    return null;
  }
}
