/**
 * In-memory revision snapshot cache — speeds undo/redo by avoiding redundant
 * fetches. Intentionally much smaller than server retention (30): only hot
 * neighbors around the cursor, with LRU + byte caps.
 */

import {
  REVISION_CONTENT_CACHE_MAX_BYTES_PER_FILE_DEFAULT,
  REVISION_CONTENT_CACHE_MAX_ENTRIES_PER_FILE_DEFAULT,
  REVISION_CONTENT_CACHE_MAX_ENTRY_BYTES_DEFAULT,
} from '@open-design/contracts';

export const REVISION_CONTENT_CACHE_MAX_ENTRIES_PER_FILE =
  REVISION_CONTENT_CACHE_MAX_ENTRIES_PER_FILE_DEFAULT;

export const REVISION_CONTENT_CACHE_MAX_ENTRY_BYTES =
  REVISION_CONTENT_CACHE_MAX_ENTRY_BYTES_DEFAULT;

export const REVISION_CONTENT_CACHE_MAX_BYTES_PER_FILE =
  REVISION_CONTENT_CACHE_MAX_BYTES_PER_FILE_DEFAULT;

type CacheEntry = {
  content: string;
  bytes: number;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(projectId: string, fileName: string, revisionId: string): string {
  return `${projectId}\0${fileName}\0${revisionId}`;
}

function filePrefix(projectId: string, fileName: string): string {
  return `${projectId}\0${fileName}\0`;
}

function contentByteLength(content: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(content).length;
  }
  return Buffer.byteLength(content, 'utf8');
}

export function shouldCacheRevisionContent(input: string | { byteSize: number }): boolean {
  const bytes = typeof input === 'string' ? contentByteLength(input) : input.byteSize;
  return bytes <= REVISION_CONTENT_CACHE_MAX_ENTRY_BYTES;
}

function touchCacheKey(key: string, entry: CacheEntry): void {
  cache.delete(key);
  cache.set(key, entry);
}

function entriesForFile(projectId: string, fileName: string): Array<[string, CacheEntry]> {
  const prefix = filePrefix(projectId, fileName);
  return [...cache.entries()].filter(([key]) => key.startsWith(prefix));
}

function totalBytesForFile(projectId: string, fileName: string): number {
  return entriesForFile(projectId, fileName).reduce((sum, [, entry]) => sum + entry.bytes, 0);
}

function evictUntilWithinBudget(
  projectId: string,
  fileName: string,
  incomingBytes: number,
): void {
  const prefix = filePrefix(projectId, fileName);
  while (true) {
    const entries = entriesForFile(projectId, fileName);
    const overCount = entries.length >= REVISION_CONTENT_CACHE_MAX_ENTRIES_PER_FILE;
    const overBytes = totalBytesForFile(projectId, fileName) + incomingBytes
      > REVISION_CONTENT_CACHE_MAX_BYTES_PER_FILE;
    if (!overCount && !overBytes) return;
    const oldest = entries.find(([key]) => key.startsWith(prefix));
    if (!oldest) return;
    cache.delete(oldest[0]);
  }
}

export function getRevisionContentCache(
  projectId: string,
  fileName: string,
  revisionId: string,
): string | null {
  const key = cacheKey(projectId, fileName, revisionId);
  const entry = cache.get(key);
  if (!entry) return null;
  touchCacheKey(key, entry);
  return entry.content;
}

export function setRevisionContentCache(
  projectId: string,
  fileName: string,
  revisionId: string,
  content: string,
): void {
  if (!shouldCacheRevisionContent(content)) return;

  const bytes = contentByteLength(content);
  const key = cacheKey(projectId, fileName, revisionId);
  if (cache.has(key)) {
    cache.delete(key);
  }
  evictUntilWithinBudget(projectId, fileName, bytes);
  cache.set(key, { content, bytes });
}

export function clearRevisionContentCacheForFile(projectId: string, fileName: string): void {
  const prefix = filePrefix(projectId, fileName);
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/** Drop one revision entry (e.g. stale tip cache after confirm-refuse adopt). */
export function clearRevisionContentCacheEntry(
  projectId: string,
  fileName: string,
  revisionId: string,
): void {
  cache.delete(cacheKey(projectId, fileName, revisionId));
}

export type RevisionPrefetchTarget = {
  revisionId: string;
  byteSize?: number;
};

export function prefetchRevisionContents(
  projectId: string,
  fileName: string,
  targets: RevisionPrefetchTarget[],
  fetchContent: (revisionId: string) => Promise<string | null>,
): void {
  const seen = new Set<string>();
  for (const target of targets) {
    const { revisionId, byteSize } = target;
    if (!revisionId || seen.has(revisionId)) continue;
    seen.add(revisionId);
    if (byteSize != null && !shouldCacheRevisionContent({ byteSize })) continue;
    if (getRevisionContentCache(projectId, fileName, revisionId) != null) continue;
    void fetchContent(revisionId).then((content) => {
      if (content != null) {
        setRevisionContentCache(projectId, fileName, revisionId, content);
      }
    });
  }
}
