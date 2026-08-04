import { projectFilePathExists } from './projectFilePaths';

const missingProjectRawFiles = new Set<string>();

export function projectRawFileCacheKey(projectId: string, path: string): string {
  return `${projectId.trim()}::${path.trim()}`;
}

export function isProjectRawFileKnownMissing(projectId: string, path: string): boolean {
  const key = projectRawFileCacheKey(projectId, path);
  return key !== '::' && missingProjectRawFiles.has(key);
}

export function markProjectRawFileMissing(projectId: string, path: string): void {
  const key = projectRawFileCacheKey(projectId, path);
  if (key !== '::') missingProjectRawFiles.add(key);
}

export function clearProjectRawFileMissing(projectId: string, path: string): void {
  missingProjectRawFiles.delete(projectRawFileCacheKey(projectId, path));
}

/** Drop every session 404 entry for a project (e.g. after a full files refresh). */
export function clearProjectRawFileMissingForProject(projectId: string): void {
  const prefix = `${projectId.trim()}::`;
  if (prefix === '::') return;
  for (const key of missingProjectRawFiles) {
    if (key.startsWith(prefix)) missingProjectRawFiles.delete(key);
  }
}

/**
 * When the project index shows a path exists, clear stale session 404 marks
 * so authenticated thumbnails can refetch after upload races.
 */
export function reconcileProjectRawFileMissingCache(
  projectId: string,
  knownPaths: ReadonlySet<string>,
): void {
  const id = projectId.trim();
  if (!id) return;
  const prefix = `${id}::`;
  for (const key of missingProjectRawFiles) {
    if (!key.startsWith(prefix)) continue;
    const path = key.slice(prefix.length);
    if (projectFilePathExists(knownPaths, path)) {
      missingProjectRawFiles.delete(key);
    }
  }
}

/** @internal vitest only */
export function resetProjectRawFileFetchCacheForTests(): void {
  missingProjectRawFiles.clear();
}
