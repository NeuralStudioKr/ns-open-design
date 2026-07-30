/** In-memory revision snapshot cache — speeds undo/redo by avoiding redundant fetches. */

const MAX_ENTRIES_PER_FILE = 32;

const cache = new Map<string, string>();

function cacheKey(projectId: string, fileName: string, revisionId: string): string {
  return `${projectId}\0${fileName}\0${revisionId}`;
}

function filePrefix(projectId: string, fileName: string): string {
  return `${projectId}\0${fileName}\0`;
}

export function getRevisionContentCache(
  projectId: string,
  fileName: string,
  revisionId: string,
): string | null {
  return cache.get(cacheKey(projectId, fileName, revisionId)) ?? null;
}

export function setRevisionContentCache(
  projectId: string,
  fileName: string,
  revisionId: string,
  content: string,
): void {
  const prefix = filePrefix(projectId, fileName);
  const keysForFile = [...cache.keys()].filter((key) => key.startsWith(prefix));
  if (keysForFile.length >= MAX_ENTRIES_PER_FILE) {
    for (const key of keysForFile.slice(0, keysForFile.length - MAX_ENTRIES_PER_FILE + 1)) {
      cache.delete(key);
    }
  }
  cache.set(cacheKey(projectId, fileName, revisionId), content);
}

export function clearRevisionContentCacheForFile(projectId: string, fileName: string): void {
  const prefix = filePrefix(projectId, fileName);
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

export function prefetchRevisionContents(
  projectId: string,
  fileName: string,
  revisionIds: string[],
  fetchContent: (revisionId: string) => Promise<string | null>,
): void {
  for (const revisionId of [...new Set(revisionIds)]) {
    if (getRevisionContentCache(projectId, fileName, revisionId) != null) continue;
    void fetchContent(revisionId).then((content) => {
      if (content != null) {
        setRevisionContentCache(projectId, fileName, revisionId, content);
      }
    });
  }
}
