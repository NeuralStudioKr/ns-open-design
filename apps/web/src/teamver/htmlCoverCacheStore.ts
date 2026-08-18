/**
 * Shared in-memory HTML cover srcDoc cache (home batch warm + card mounts).
 */

const htmlCoverCache = new Map<string, string>();
const htmlCoverInflight = new Map<string, Promise<string>>();

/**
 * In-memory cache key for HTML cover srcDoc. Keep `?v=` / coverVersion so a
 * deck edit that bumps mtime does not reuse a stale first-slide snapshot.
 * Fragments (`#…`) are still stripped.
 */
export function htmlCoverCacheKey(mode: "deck" | "page", src: string): string {
  const withoutHash = (src.split(/#/u, 1)[0] ?? src).trim();
  return `v4:${mode}:${withoutHash}`;
}

/**
 * Drop first-slide srcDocs for one project (or every project).
 * Template Clone seeds `deck.html` LOOK; fill/edits overwrite that file.
 * Path-only cache keys must not keep the clone snapshot after the write.
 */
export function clearHtmlCoverCacheForProject(projectId?: string): void {
  const id = projectId?.trim() ?? "";
  if (!id) {
    htmlCoverCache.clear();
    htmlCoverInflight.clear();
    return;
  }
  const needle = `/api/projects/${id}/raw/`;
  for (const key of [...htmlCoverCache.keys()]) {
    if (key.includes(needle)) htmlCoverCache.delete(key);
  }
  for (const key of [...htmlCoverInflight.keys()]) {
    if (key.includes(needle)) htmlCoverInflight.delete(key);
  }
}

export function peekHtmlCoverCache(cacheKey: string): string | null {
  return htmlCoverCache.get(cacheKey) ?? null;
}

/** Prefetch / batch warm — skip per-card /raw when srcDoc is already built. */
export function seedHtmlCoverCache(cacheKey: string, srcDoc: string): void {
  const key = cacheKey.trim();
  if (!key || !srcDoc.trim()) return;
  htmlCoverCache.set(key, srcDoc);
}

export function getHtmlCoverInflight(
  cacheKey: string,
): Promise<string> | undefined {
  return htmlCoverInflight.get(cacheKey);
}

export function setHtmlCoverInflight(
  cacheKey: string,
  pending: Promise<string>,
): void {
  htmlCoverInflight.set(cacheKey, pending);
}

export function deleteHtmlCoverInflight(cacheKey: string): void {
  htmlCoverInflight.delete(cacheKey);
}

/** @internal vitest */
export function clearHtmlCoverCacheStoreForTests(): void {
  htmlCoverCache.clear();
  htmlCoverInflight.clear();
}
