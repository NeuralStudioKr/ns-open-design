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
  const baseName = projectFilePathBasename(path);
  return /^[a-z0-9]+-drawing-\d{4}-\d{2}-\d{2}T[\d-]+Z\.png$/i.test(baseName);
}

export function projectFilePathBasename(path: string): string {
  const trimmed = String(path || '').trim().replace(/\\/g, '/');
  return trimmed.split('/').pop() || trimmed;
}

/** Treat `uploads/foo.png` and bare `foo.png` as the same project file. */
export function projectFilePathsReferToSameFile(a: string, b: string): boolean {
  const left = String(a || '').trim().replace(/\\/g, '/');
  const right = String(b || '').trim().replace(/\\/g, '/');
  if (!left || !right) return false;
  if (left === right) return true;
  return projectFilePathBasename(left) === projectFilePathBasename(right);
}

export function projectFilePathsInclude(
  paths: Iterable<string>,
  path: string,
): boolean {
  for (const candidate of paths) {
    if (projectFilePathsReferToSameFile(candidate, path)) return true;
  }
  return false;
}

export function visualCommentScreenshotPaths(
  commentAttachments: ReadonlyArray<{ screenshotPath?: string | null }>,
): string[] {
  return commentAttachments
    .map((attachment) => String(attachment.screenshotPath || '').trim())
    .filter(Boolean);
}

export function excludeAttachmentsBackedByVisualScreenshots<T extends { path: string }>(
  attachments: readonly T[],
  commentAttachments: ReadonlyArray<{ screenshotPath?: string | null }>,
): T[] {
  const screenshotPaths = visualCommentScreenshotPaths(commentAttachments);
  if (screenshotPaths.length === 0) return [...attachments];
  return attachments.filter((attachment) => {
    const path = String(attachment.path || '').trim();
    if (!path) return false;
    return !projectFilePathsInclude(screenshotPaths, path);
  });
}
