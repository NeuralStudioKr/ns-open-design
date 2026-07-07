import type { Route } from '../router';

/** Project ids that must stay accessible through a workspace switch reconciliation. */
export function capturePreWorkspaceSwitchProjectGuards(input: {
  route: Route;
  pendingLocalProjectIds: ReadonlySet<string>;
  sessionActiveRunProjectIds: ReadonlySet<string>;
}): Set<string> {
  const preserved = new Set<string>();
  for (const id of input.pendingLocalProjectIds) {
    const trimmed = id.trim();
    if (trimmed) preserved.add(trimmed);
  }
  for (const id of input.sessionActiveRunProjectIds) {
    const trimmed = id.trim();
    if (trimmed) preserved.add(trimmed);
  }
  if (input.route.kind === 'project') {
    const trimmed = input.route.projectId.trim();
    if (trimmed) preserved.add(trimmed);
  }
  return preserved;
}

/**
 * True when a workspace-changed event should not run destructive switch side
 * effects (list wipe, session-trusted ref clear, home bounce).
 */
export function shouldSkipWorkspaceSwitchSideEffects(
  previousWorkspaceId: string | null,
  nextWorkspaceId: string,
): boolean {
  const trimmed = nextWorkspaceId.trim();
  if (!trimmed) return true;
  if (previousWorkspaceId === trimmed) return true;
  // Boot/cross-tab relay before the embed workspace ref is seeded — pin only.
  if (previousWorkspaceId === null) return true;
  return false;
}

export function isPreWorkspaceSwitchTrustedProject(
  projectId: string,
  preservedProjectIds: ReadonlySet<string>,
): boolean {
  const trimmed = projectId.trim();
  if (!trimmed) return false;
  return preservedProjectIds.has(trimmed);
}
