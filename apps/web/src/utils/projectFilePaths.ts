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

/** User annotation / draw screenshots — never assistant-produced deliverables. */
export function isUserAnnotationDrawingScreenshotPath(path: string): boolean {
  const baseName = projectFilePathBasename(path).toLowerCase();
  if (!baseName.endsWith('.png')) return false;
  if (/^drawing-\d{4}-\d{2}-\d{2}t[\d-]+z\.png$/i.test(baseName)) return true;
  if (/^[a-z0-9]+-drawing-.*\.png$/i.test(baseName)) return true;
  // Older / alternate visual-mark uploads (still GC'd independently of deliverables).
  if (/^visual-mark[-_].*\.png$/i.test(baseName)) return true;
  return false;
}

export function isEphemeralDrawingScreenshotPath(path: string): boolean {
  return isUserAnnotationDrawingScreenshotPath(path);
}

export function projectFilePathBasename(path: string): string {
  const trimmed = String(path || '').trim().replace(/\\/g, '/');
  return trimmed.split('/').pop() || trimmed;
}

/** Raster/vector paths that must never be opened in the text viewer. */
export function isRenderableImagePath(path: string): boolean {
  const base = projectFilePathBasename(String(path || '').trim().toLowerCase());
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(base);
}

/** Prefer daemon `path` when present; fall back to flat `name`. */
export function projectFileResolvedPath(file: { name: string; path?: string | null }): string {
  const path = String(file.path ?? '').trim().replace(/\\/g, '/');
  if (path) return path;
  return String(file.name ?? '').trim();
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

/** Fresh Drive (`refs/…`) or timestamped root uploads that /files may lag on. */
export function isLikelyDurableUploadedImagePath(path: string): boolean {
  const normalized = String(path || '').trim().replace(/\\/g, '/');
  if (!normalized || !/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(normalized)) return false;
  if (normalized === 'refs' || normalized.startsWith('refs/')) return true;
  const base = projectFilePathBasename(normalized);
  return /^[a-z0-9]{6,12}-.+/i.test(base);
}

/**
 * Whether a chat attachment chip should stay visible for this project file
 * index. Ephemeral drawing screenshots remain index-gated so GC'd marks do not
 * resurrect after refresh. Every other persisted message attachment is
 * authoritative — `/files` lag must not hide Drive/local/board image chips
 * (including non-timestamp names like `uploads/ref-memo.png`).
 */
export function chatAttachmentVisibleInProjectFiles(
  projectFileNames: ReadonlySet<string> | undefined,
  path: string,
): boolean {
  if (projectFilePathExists(projectFileNames, path)) return true;
  if (isEphemeralDrawingScreenshotPath(path)) return false;
  return true;
}
