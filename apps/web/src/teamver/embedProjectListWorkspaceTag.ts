/**
 * The home rail keeps its rows in a single untagged `projects` state, so nothing
 * in `App` used to know which workspace painted them. Two places then leak the
 * previous tenant's cards after a switch (0908-N01 slice F):
 *
 *  - a failed recent fetch deliberately retains the rows on screen so a
 *    transient 401 does not flash an empty rail, and
 *  - `mergeRecentProjectsIntoList` is a union, so a successful fetch shows both
 *    workspaces at once.
 *
 * Tagging the painted rows with their workspace turns both into a comparison.
 */

/**
 * Whether the rows currently on screen belong to a different workspace than the
 * one Design is acting on.
 *
 * Unknown on either side usually means "do not decide": boot paints before
 * the active-workspace ref is seeded, and treating that as a mismatch would
 * wipe a perfectly good first rail.
 *
 * Exception (0908-N01 H3): when rows are already on screen but nobody tagged
 * them (deeplink prefetch / hydrate), `painted === null` must not mean
 * "keep forever". With an active workspace known, untagged rows are treated
 * as a mismatch so wipe/replace can run.
 */
export function isProjectListWorkspaceMismatch(
  paintedWorkspaceId: string | null | undefined,
  activeWorkspaceId: string | null | undefined,
  options?: { hasPaintedRows?: boolean },
): boolean {
  const painted = paintedWorkspaceId?.trim() || null;
  const active = activeWorkspaceId?.trim() || null;
  if (!active) return false;
  if (!painted) return Boolean(options?.hasPaintedRows);
  return painted !== active;
}

/**
 * The workspace a project-list request (or a fresh paint) belongs to.
 *
 * `embedActiveWorkspaceIdRef` is only filled after the boot-wait effect
 * resolves, so requests and paints that start during boot used to carry `null`.
 * That made both `isProjectListWorkspaceStale` and
 * `isProjectListWorkspaceMismatch` undecidable for exactly the window where a
 * workspace reconcile is most likely (0908-N01 slice G, risk 3). The stored
 * snapshot is the same value boot is about to confirm, so it is the right
 * stand-in — and the ref still wins once it exists, including the
 * `\0boot-flush:` sentinel, which must not be masked by the snapshot.
 */
export function resolveProjectListWorkspaceId(
  refWorkspaceId: string | null | undefined,
  snapshotWorkspaceId: string | null | undefined,
): string | null {
  return (refWorkspaceId?.trim() || null) ?? (snapshotWorkspaceId?.trim() || null);
}

/**
 * Whether a project-list response belongs to a workspace Design has left.
 *
 * Unknown on either side means "do not decide", same as
 * `isProjectListWorkspaceMismatch`: dropping a response we cannot place is
 * worse than applying it, because the painted tag catches the leak downstream.
 */
export function isProjectListWorkspaceStale(
  requestWorkspaceId: string | null | undefined,
  activeWorkspaceId: string | null | undefined,
): boolean {
  return isProjectListWorkspaceMismatch(requestWorkspaceId, activeWorkspaceId);
}
