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
  const trimmed = String(path || '').trim().replace(/\\/g, '/');
  if (!trimmed) return false;
  if (!projectFileNames) {
    return !isEphemeralDrawingScreenshotPath(trimmed);
  }
  if (projectFileNames.has(trimmed)) return true;
  const baseName = trimmed.split('/').pop() || trimmed;
  const hasDirectory = trimmed.includes('/');
  // Nested paths must match the full relative path (or a suffix of it).
  // Do not treat `assets/a.png` as proof that `uploads/a.png` exists.
  if (hasDirectory) {
    for (const name of projectFileNames) {
      const normalized = String(name || '').replace(/\\/g, '/');
      if (normalized === trimmed || normalized.endsWith(`/${trimmed}`)) return true;
    }
    return false;
  }
  if (projectFileNames.has(baseName)) return true;
  for (const name of projectFileNames) {
    const normalized = String(name || '').replace(/\\/g, '/');
    if (normalized === baseName || normalized.endsWith(`/${baseName}`)) return true;
  }
  return false;
}

export function isEphemeralDrawingScreenshotPath(path: string): boolean {
  const baseName = String(path || '').trim().split('/').pop() || '';
  return /^[a-z0-9]+-drawing-\d{4}-\d{2}-\d{2}T[\d-]+Z\.png$/i.test(baseName);
}
