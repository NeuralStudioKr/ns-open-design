/**
 * Match a project-relative path against the flat file list returned by
 * `/api/projects/:id/files`. Handles nested paths and bare basenames.
 */
export function projectFilePathExists(
  projectFileNames: ReadonlySet<string> | undefined,
  path: string,
): boolean {
  if (!projectFileNames) return true;
  const trimmed = String(path || '').trim();
  if (!trimmed) return false;
  if (projectFileNames.has(trimmed)) return true;
  const baseName = trimmed.split('/').pop() || trimmed;
  if (projectFileNames.has(baseName)) return true;
  for (const name of projectFileNames) {
    if (name === baseName || name.endsWith(`/${baseName}`)) return true;
  }
  return false;
}
