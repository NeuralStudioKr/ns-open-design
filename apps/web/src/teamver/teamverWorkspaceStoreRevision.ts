const STORE_REVISION_KEY = "teamver_design_workspace_store_revision_ms";

/** Milliseconds when embed explicitly picked a workspace (setActiveTeamverWorkspace). */
export function readTeamverWorkspaceStoreRevisionMs(): number {
  try {
    const raw = localStorage.getItem(STORE_REVISION_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function bumpTeamverWorkspaceStoreRevision(): void {
  try {
    localStorage.setItem(STORE_REVISION_KEY, String(Date.now()));
  } catch {
    // localStorage may be unavailable in hardened embed contexts.
  }
}
