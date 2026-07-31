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
