import { projectFilePathBasename } from './projectFilePaths';

/**
 * Heal deck HTML where the model embedded a human/original filename (or the
 * sanitized basename without the upload timestamp prefix) instead of the
 * real project-relative path returned by `/upload`.
 *
 * Local composer uploads land as `<base36>-<sanitizedOriginal>` at the
 * project root. FE used to keep `ChatAttachment.name = originalName`, so
 * model-facing prompts advertised `photo.jpeg` while the file was
 * `msh9y0i9-photo.jpeg` — broken <img> + alt-only in preview/export.
 */
export function rewriteAttachmentImageSrcs(
  html: string,
  projectFilePaths: readonly string[],
): string {
  if (!html || projectFilePaths.length === 0) return html;

  const byExact = new Set<string>();
  const byBasename = new Map<string, string[]>();
  const bySanitizedStem = new Map<string, string[]>();
  const byLettersOnly = new Map<string, string[]>();

  for (const raw of projectFilePaths) {
    const path = String(raw || '').trim().replace(/\\/g, '/');
    if (!path || !isImagePath(path)) continue;
    byExact.add(path);
    const base = projectFilePathBasename(path);
    pushMap(byBasename, base.toLowerCase(), path);
    const stem = stripUploadTimestampPrefix(base);
    if (stem && stem !== base) {
      pushMap(bySanitizedStem, stem.toLowerCase(), path);
      pushMap(bySanitizedStem, sanitizeUploadFilename(stem).toLowerCase(), path);
    }
    pushMap(bySanitizedStem, sanitizeUploadFilename(base).toLowerCase(), path);
    const letters = lettersOnlyImageStem(stem || base);
    if (letters) pushMap(byLettersOnly, letters, path);
  }

  if (byExact.size === 0) return html;

  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi,
    (full, prefix: string, quote: string, rawSrc: string) => {
      const src = String(rawSrc || '').trim();
      if (!src || /^(?:https?:|data:|blob:|mailto:|tel:|#|\/\/|\/)/i.test(src)) {
        return full;
      }
      const cleaned = src.split(/[?#]/u, 1)[0]?.trim() ?? '';
      if (!cleaned || cleaned.includes('..')) return full;
      const normalized = cleaned.replace(/^\/+/, '').replace(/\\/g, '/');
      if (byExact.has(normalized)) return full;

      const base = projectFilePathBasename(normalized);
      const candidates =
        byBasename.get(base.toLowerCase())
        ?? bySanitizedStem.get(base.toLowerCase())
        ?? bySanitizedStem.get(sanitizeUploadFilename(base).toLowerCase())
        ?? bySanitizedStem.get(sanitizeUploadFilename(normalized).toLowerCase())
        ?? byLettersOnly.get(lettersOnlyImageStem(base));

      const resolved = pickUniqueRewriteCandidate(candidates, normalized);
      if (!resolved || resolved === normalized) return full;
      return `${prefix}${quote}${resolved}${quote}`;
    },
  );
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path);
}

/** Mirror daemon `sanitizeName` for matching original/display names to stored files. */
export function sanitizeUploadFilename(raw: string): string {
  const cleaned = String(raw ?? '')
    .replace(/[\\/]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}._-]/gu, '_')
    .replace(/^\.+/, '_')
    .trim();
  return cleaned || 'file';
}

/** `msh9y0i9-photo.jpeg` → `photo.jpeg` (daemon upload timestamp prefix). */
export function stripUploadTimestampPrefix(filename: string): string {
  const base = projectFilePathBasename(filename);
  const match = /^[a-z0-9]{6,12}-(.+)$/i.exec(base);
  return match?.[1] || base;
}

/** `놀란고양이-_1_.jpeg` / `놀란 고양이.jpeg` → `놀란고양이` for fuzzy unique match. */
export function lettersOnlyImageStem(filename: string): string {
  return projectFilePathBasename(filename)
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}]+/gu, '')
    .toLowerCase();
}

function pushMap(map: Map<string, string[]>, key: string, value: string): void {
  if (!key) return;
  const list = map.get(key);
  if (!list) {
    map.set(key, [value]);
    return;
  }
  if (!list.includes(value)) list.push(value);
}

function pickUniqueRewriteCandidate(
  candidates: string[] | undefined,
  normalizedSrc: string,
): string | null {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;
  // When root upload + Drive share a stem, prefer the Drive path if the model
  // omitted a directory (the common broken case for Drive attaches).
  if (!normalizedSrc.includes('/')) {
    const driveOnly = candidates.filter((path) => path.startsWith('refs/drive/'));
    if (driveOnly.length === 1) return driveOnly[0] ?? null;
  }
  return null;
}
