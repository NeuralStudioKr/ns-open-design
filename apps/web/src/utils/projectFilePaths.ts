/**
 * Match a project-relative path against the flat file list returned by
 * `/api/projects/:id/files`. Handles nested paths and bare basenames.
 *
 * When the index is unavailable, allow fetch only for non-drawing paths so
 * stale visual-mark screenshots do not spam raw GETs from chat history.
 */
export function projectFilePathExists(
  projectFileNames: ReadonlySet<string> | undefined,
  path: string,
): boolean {
  const trimmed = String(path || '').trim();
  if (!trimmed) return false;
  if (!projectFileNames) {
    return !isEphemeralDrawingScreenshotPath(trimmed);
  }
  if (projectFileNames.has(trimmed)) return true;
  const baseName = trimmed.split('/').pop() || trimmed;
  if (projectFileNames.has(baseName)) return true;
  for (const name of projectFileNames) {
    if (name === baseName || name.endsWith(`/${baseName}`)) return true;
  }
  return false;
}

export function isEphemeralDrawingScreenshotPath(path: string): boolean {
  const baseName = String(path || '').trim().split('/').pop() || '';
  return /^[a-z0-9]+-drawing-\d{4}-\d{2}-\d{2}T[\d-]+Z\.png$/i.test(baseName);
}
