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
 * Unknown on either side means "do not decide": boot paints before
 * `embedActiveWorkspaceIdRef` is seeded, and treating that as a mismatch would
 * wipe a perfectly good first rail.
 */
export function isProjectListWorkspaceMismatch(
  paintedWorkspaceId: string | null | undefined,
  activeWorkspaceId: string | null | undefined,
): boolean {
  const painted = paintedWorkspaceId?.trim() || null;
  const active = activeWorkspaceId?.trim() || null;
  if (!painted || !active) return false;
  return painted !== active;
}
