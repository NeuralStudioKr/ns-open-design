const projectS3PrefixCache = new Map<string, string>();
const prefixListeners = new Map<string, Set<() => void>>();

function cacheKey(workspaceId: string, projectId: string): string {
  return `${workspaceId.trim()}:${projectId.trim()}`;
}

function notifyPrefixListeners(key: string): void {
  const listeners = prefixListeners.get(key);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Listener errors must not break prefix cache writes.
    }
  }
}

/**
 * Embed — refetch authenticated raw assets when the scoped preview prefix
 * arrives after first paint (same race as FileViewer srcDoc remount).
 */
export function subscribeTeamverProjectS3Prefix(
  workspaceId: string,
  projectId: string,
  listener: () => void,
): () => void {
  const key = cacheKey(workspaceId, projectId);
  if (!key || key === ':') return () => {};
  const bucket = prefixListeners.get(key) ?? new Set();
  bucket.add(listener);
  prefixListeners.set(key, bucket);
  return () => {
    bucket.delete(listener);
    if (bucket.size === 0) prefixListeners.delete(key);
  };
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
  const key = cacheKey(ws, id);
  const prev = projectS3PrefixCache.get(key);
  if (prev === prefix) return;
  projectS3PrefixCache.set(key, prefix);
  notifyPrefixListeners(key);
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
  prefixListeners.clear();
}
