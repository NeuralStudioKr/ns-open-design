const projectS3PrefixCache = new Map<string, string>();

function cacheKey(workspaceId: string, projectId: string): string {
  return `${workspaceId.trim()}:${projectId.trim()}`;
}

/** Embed — remember design-api tenant prefix after registry create (daemon header hint). */
export function rememberTeamverProjectS3Prefix(
  workspaceId: string,
  projectId: string,
  s3Prefix: string | null | undefined,
): void {
  const prefix = s3Prefix?.trim();
  const ws = workspaceId.trim();
  const id = projectId.trim();
  if (!prefix || !ws || !id) return;
  projectS3PrefixCache.set(cacheKey(ws, id), prefix);
}

export function readTeamverProjectS3Prefix(
  workspaceId: string,
  projectId: string,
): string | undefined {
  const ws = workspaceId.trim();
  const id = projectId.trim();
  if (!ws || !id) return undefined;
  return projectS3PrefixCache.get(cacheKey(ws, id));
}

export function clearTeamverProjectS3Prefix(
  projectId: string,
  workspaceId?: string,
): void {
  const trimmed = projectId.trim();
  if (!trimmed) return;
  if (workspaceId?.trim()) {
    projectS3PrefixCache.delete(cacheKey(workspaceId, trimmed));
    return;
  }
  for (const key of projectS3PrefixCache.keys()) {
    if (key.endsWith(`:${trimmed}`)) projectS3PrefixCache.delete(key);
  }
}

export function clearAllTeamverProjectS3PrefixCache(): void {
  projectS3PrefixCache.clear();
}
