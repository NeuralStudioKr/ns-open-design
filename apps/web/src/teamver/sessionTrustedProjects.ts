export function isTeamverSessionTrustedProject(
  projectId: string,
  sources: {
    pendingLocalProjectIds?: ReadonlySet<string> | null;
    sessionActiveRunProjectIds?: ReadonlySet<string> | null;
  },
): boolean {
  const trimmed = projectId.trim();
  if (!trimmed) return false;
  return Boolean(
    sources.pendingLocalProjectIds?.has(trimmed) ||
      sources.sessionActiveRunProjectIds?.has(trimmed),
  );
}
