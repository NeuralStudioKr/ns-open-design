/**
 * Snapshot of project ids with in-flight daemon runs in this embed session.
 * App keeps the authoritative Set in a ref; passive-auth reads this module so
 * background runs defer login redirect after the user leaves ProjectView.
 */
let sessionActiveRunProjectIds = new Set<string>();

export function publishTeamverSessionActiveRunProjectIds(
  ids: ReadonlySet<string>,
): void {
  sessionActiveRunProjectIds = new Set(ids);
}

export function hasTeamverEmbedBackgroundRuns(): boolean {
  return sessionActiveRunProjectIds.size > 0;
}

/** @internal vitest only */
export function resetTeamverEmbedSessionActiveRunProjectIdsForTests(): void {
  sessionActiveRunProjectIds = new Set();
}
