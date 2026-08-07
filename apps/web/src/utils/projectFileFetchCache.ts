import {
  isEphemeralDrawingScreenshotPath,
  normalizeProjectFilePath,
  projectFilePathBasename,
  projectFilePathExists,
  projectFilePathToNfd,
} from './projectFilePaths';

const missingProjectRawFiles = new Set<string>();
const MISSING_CACHE_STORAGE_KEY = 'open-design:missing-project-raw-files:v1';
const MISSING_CACHE_MAX_ENTRIES = 500;

function canUseSessionStorage(): boolean {
  try {
    return typeof sessionStorage !== 'undefined';
  } catch {
    return false;
  }
}

function persistMissingCache(): void {
  if (!canUseSessionStorage()) return;
  try {
    const entries = [...missingProjectRawFiles];
    const trimmed =
      entries.length > MISSING_CACHE_MAX_ENTRIES
        ? entries.slice(entries.length - MISSING_CACHE_MAX_ENTRIES)
        : entries;
    sessionStorage.setItem(MISSING_CACHE_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* private mode / quota */
  }
}

function hydrateMissingCache(): void {
  if (!canUseSessionStorage()) return;
  try {
    const raw = sessionStorage.getItem(MISSING_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed) {
      if (typeof entry !== 'string' || !entry.includes('::')) continue;
      missingProjectRawFiles.add(entry);
    }
  } catch {
    /* corrupt */
  }
}

hydrateMissingCache();

export function projectRawFileCacheKey(projectId: string, path: string): string {
  return `${projectId.trim()}::${path.trim().replace(/\\/g, '/')}`;
}

function missingPathVariants(path: string): string[] {
  const raw = String(path || '').trim().replace(/\\/g, '/');
  const nfc = normalizeProjectFilePath(path);
  const nfd = projectFilePathToNfd(path);
  if (!raw && !nfc) return [];
  const out = new Set<string>();
  if (raw) out.add(raw);
  if (nfc) out.add(nfc);
  if (nfd) out.add(nfd);
  const primary = nfc || raw;
  const baseName = projectFilePathBasename(primary);
  const baseNameNfd = projectFilePathToNfd(baseName);
  if (baseName && baseName !== primary) out.add(baseName);
  if (baseNameNfd && baseNameNfd !== baseName) out.add(baseNameNfd);
  if (baseName && !primary.includes('/')) {
    // Match alternateAuthenticatedRawPaths so a truly missing file (all probed
    // 404) short-circuits on next remount without re-storming refs/drive etc.
    out.add(`refs/drive/${baseName}`);
    out.add(`refs/${baseName}`);
    out.add(`uploads/${baseName}`);
    out.add(`assets/${baseName}`);
    if (baseNameNfd && baseNameNfd !== baseName) {
      out.add(`refs/drive/${baseNameNfd}`);
      out.add(`uploads/${baseNameNfd}`);
    }
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
  let changed = false;
  for (const candidate of missingPathVariants(path)) {
    const key = projectRawFileCacheKey(id, candidate);
    if (key === '::' || missingProjectRawFiles.has(key)) continue;
    missingProjectRawFiles.add(key);
    changed = true;
  }
  if (changed) persistMissingCache();
}

export function clearProjectRawFileMissing(projectId: string, path: string): void {
  const id = projectId.trim();
  if (!id) return;
  let changed = false;
  for (const candidate of missingPathVariants(path)) {
    const key = projectRawFileCacheKey(id, candidate);
    if (!missingProjectRawFiles.delete(key)) continue;
    changed = true;
  }
  if (changed) persistMissingCache();
}

/** Drop every session 404 entry for a project (e.g. after a full files refresh). */
export function clearProjectRawFileMissingForProject(projectId: string): void {
  const prefix = `${projectId.trim()}::`;
  if (prefix === '::') return;
  let changed = false;
  for (const key of [...missingProjectRawFiles]) {
    if (!key.startsWith(prefix)) continue;
    missingProjectRawFiles.delete(key);
    changed = true;
  }
  if (changed) persistMissingCache();
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
    if (
      projectFilePathExists(knownPaths, path)
      && !isEphemeralDrawingScreenshotPath(path)
    ) {
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
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.removeItem(MISSING_CACHE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
