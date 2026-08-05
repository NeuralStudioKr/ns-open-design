import { projectFilePathBasename, projectFilePathExists } from './projectFilePaths';

const missingProjectRawFiles = new Set<string>();

export function projectRawFileCacheKey(projectId: string, path: string): string {
  return `${projectId.trim()}::${path.trim().replace(/\\/g, '/')}`;
}

function missingPathVariants(path: string): string[] {
  const normalized = String(path || '').trim().replace(/\\/g, '/');
  if (!normalized) return [];
  const out = new Set<string>([normalized]);
  const baseName = projectFilePathBasename(normalized);
  if (baseName && baseName !== normalized) out.add(baseName);
  if (baseName && !normalized.includes('/')) {
    out.add(`uploads/${baseName}`);
    out.add(`assets/${baseName}`);
  }
  return [...out];
}

export function isProjectRawFileKnownMissing(projectId: string, path: string): boolean {
  const id = projectId.trim();
  if (!id) return false;
  for (const candidate of missingPathVariants(path)) {
    if (missingProjectRawFiles.has(projectRawFileCacheKey(id, candidate))) {
      return true;
    }
  }
  return false;
}

export function markProjectRawFileMissing(projectId: string, path: string): void {
  const id = projectId.trim();
  if (!id) return;
  for (const candidate of missingPathVariants(path)) {
    const key = projectRawFileCacheKey(id, candidate);
    if (key !== '::') missingProjectRawFiles.add(key);
  }
}

export function clearProjectRawFileMissing(projectId: string, path: string): void {
  const id = projectId.trim();
  if (!id) return;
  for (const candidate of missingPathVariants(path)) {
    missingProjectRawFiles.delete(projectRawFileCacheKey(id, candidate));
  }
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
  const pathsToClear = new Set<string>();
  for (const key of missingProjectRawFiles) {
    if (!key.startsWith(prefix)) continue;
    const path = key.slice(prefix.length);
    if (projectFilePathExists(knownPaths, path)) {
      pathsToClear.add(path);
    }
  }
  for (const path of pathsToClear) {
    clearProjectRawFileMissing(id, path);
  }
}

/** @internal vitest only */
export function resetProjectRawFileFetchCacheForTests(): void {
  missingProjectRawFiles.clear();
}
