import { normalizeProjectFilePath, projectFilePathBasename } from './projectFilePaths';

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
  options?: { preferredPaths?: readonly string[] },
): string {
  if (!html || projectFilePaths.length === 0) return html;

  const preferred = new Set(
    (options?.preferredPaths ?? [])
      .map((path) => normalizeProjectFilePath(path))
      .filter(Boolean),
  );

  const byExact = new Set<string>();
  const byBasename = new Map<string, string[]>();
  const bySanitizedStem = new Map<string, string[]>();
  const byLettersOnly = new Map<string, string[]>();

  for (const raw of projectFilePaths) {
    const path = normalizeProjectFilePath(raw);
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

  const resolve = (rawSrc: string): string | null => {
    const normalized = normalizeProjectRelativeImageSrc(rawSrc);
    if (!normalized) return null;
    if (byExact.has(normalized)) return normalized;

    const base = projectFilePathBasename(normalized);
    const candidates =
      byBasename.get(base.toLowerCase())
      ?? bySanitizedStem.get(base.toLowerCase())
      ?? bySanitizedStem.get(sanitizeUploadFilename(base).toLowerCase())
      ?? bySanitizedStem.get(sanitizeUploadFilename(normalized).toLowerCase())
      ?? byLettersOnly.get(lettersOnlyImageStem(base));

    return pickUniqueRewriteCandidate(candidates, normalized, preferred);
  };

  let next = html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi,
    (full, prefix: string, quote: string, rawSrc: string) => {
      const resolved = resolve(rawSrc);
      if (!resolved) return full;
      const trimmed = String(rawSrc || '').trim();
      // Rewrite when the literal attribute differs from the canonical on-disk
      // path — including Hangul NFD→NFC and leading-slash project paths.
      if (trimmed === resolved) return full;
      return `${prefix}${quote}${resolved}${quote}`;
    },
  );

  // Models sometimes put images in CSS background-image instead of <img>.
  next = next.replace(
    /(url\(\s*)(['"]?)([^'")]+)\2(\s*\))/gi,
    (full, prefix: string, quote: string, rawSrc: string, suffix: string) => {
      if (!isImagePath(String(rawSrc || ''))) return full;
      const resolved = resolve(rawSrc);
      if (!resolved) return full;
      const trimmed = String(rawSrc || '').trim();
      if (trimmed === resolved) return full;
      return `${prefix}${quote}${resolved}${quote}${suffix}`;
    },
  );

  return next;
}

/**
 * Accept project-relative image srcs, including a single leading `/`
 * (`/refs/drive/a.png`). Reject absolute URLs, protocol-relative `//`, and
 * daemon API paths (`/api/...`).
 */
export function normalizeProjectRelativeImageSrc(src: string): string | null {
  const trimmed = String(src || '').trim();
  if (!trimmed) return null;
  if (/^(?:https?:|data:|blob:|mailto:|tel:|#)/i.test(trimmed)) return null;
  if (trimmed.startsWith('//')) return null;
  const cleaned = trimmed.split(/[?#]/u, 1)[0]?.trim() ?? '';
  if (!cleaned || cleaned.includes('..')) return null;
  let normalized = cleaned.replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    if (normalized.startsWith('/api/')) return null;
    normalized = normalized.replace(/^\/+/, '');
  }
  // Models sometimes emit `./photo.jpeg` or percent-encoded CJK basenames.
  normalized = normalized.replace(/^\.\//, '');
  if (/%[0-9A-Fa-f]{2}/.test(normalized)) {
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // Keep the encoded form and let exact/fuzzy maps miss rather than throw.
    }
  }
  // Hangul / macOS NFD ↔ NFC so Drive embeds match on-disk NFC keys.
  return normalizeProjectFilePath(normalized) || null;
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
  preferredPaths?: ReadonlySet<string>,
): string | null {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;

  if (preferredPaths && preferredPaths.size > 0) {
    const preferredHits = candidates.filter((path) => preferredPaths.has(path));
    if (preferredHits.length === 1) return preferredHits[0] ?? null;
    const newestPreferred = pickNewestTimestampedUpload(preferredHits);
    if (newestPreferred) return newestPreferred;
  }

  // When root upload + Drive share a stem, prefer the Drive path if the model
  // omitted a directory (the common broken case for Drive attaches).
  if (!normalizedSrc.includes('/')) {
    const driveOnly = candidates.filter((path) => path.startsWith('refs/drive/'));
    if (driveOnly.length === 1) return driveOnly[0] ?? null;
    const newestDrive = pickNewestTimestampedUpload(driveOnly);
    if (newestDrive) return newestDrive;

    const refsOnly = candidates.filter((path) => path.startsWith('refs/'));
    const newestRefs = pickNewestTimestampedUpload(refsOnly);
    if (newestRefs) return newestRefs;

    // Multiple local composer uploads can sanitize to the same stem
    // (`aaa-photo.jpeg`, `bbb-photo.jpeg`). Prefer the newest timestamp prefix
    // so a bare `src="photo.jpeg"` still heals to the latest attach.
    const rootUploads = candidates.filter((path) => !path.includes('/'));
    const newest = pickNewestTimestampedUpload(rootUploads);
    if (newest) return newest;
  }
  return null;
}

/** `msh9y0i9-photo.jpeg` wins over an older `msh8abcd-photo.jpeg`. */
function pickNewestTimestampedUpload(paths: readonly string[]): string | null {
  if (paths.length === 0) return null;
  let best: string | null = null;
  let bestStamp = -1;
  for (const path of paths) {
    const base = projectFilePathBasename(path);
    const match = /^([a-z0-9]{6,12})-(.+)$/i.exec(base);
    if (!match) continue;
    const stamp = Number.parseInt(match[1]!, 36);
    if (!Number.isFinite(stamp)) continue;
    if (!best || stamp > bestStamp) {
      best = path;
      bestStamp = stamp;
    }
  }
  return best;
}
