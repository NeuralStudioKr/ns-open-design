import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Persisted tombstones so sync-down cannot resurrect user-deleted files from S3. */
export const PROJECT_DELETED_RELPATHS_MANIFEST = '.od/deleted-relpaths.json';

export function normalizeProjectRelpath(relpath: string): string {
  return String(relpath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function unicodeVariants(relpath: string): string[] {
  const raw = String(relpath || '');
  const out = new Set<string>();
  if (raw) out.add(raw);
  try {
    const nfc = raw.normalize('NFC');
    if (nfc && nfc !== raw) out.add(nfc);
  } catch { /* ignore */ }
  try {
    const nfd = raw.normalize('NFD');
    if (nfd && nfd !== raw) out.add(nfd);
  } catch { /* ignore */ }
  return [...out];
}

export async function readDeletedProjectRelpaths(projectDir: string): Promise<Set<string>> {
  const manifestPath = path.join(projectDir, PROJECT_DELETED_RELPATHS_MANIFEST);
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as { paths?: unknown };
    if (!Array.isArray(parsed?.paths)) return new Set();
    const out = new Set<string>();
    for (const entry of parsed.paths) {
      const normalized = normalizeProjectRelpath(String(entry ?? ''));
      if (!normalized) continue;
      // Add all Unicode variants so a tombstone written under one form (NFC)
      // still blocks a sync-down of the alternate form (NFD) from S3 —
      // otherwise the deleted file resurrects on the next sibling-node pull.
      for (const variant of unicodeVariants(normalized)) {
        out.add(variant);
      }
    }
    return out;
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return new Set();
    }
    return new Set();
  }
}

async function writeDeletedProjectRelpaths(projectDir: string, paths: Set<string>): Promise<void> {
  const manifestPath = path.join(projectDir, PROJECT_DELETED_RELPATHS_MANIFEST);
  const manifestDir = path.dirname(manifestPath);
  await mkdir(manifestDir, { recursive: true });
  const sorted = [...paths].sort((a, b) => a.localeCompare(b));
  await writeFile(
    manifestPath,
    JSON.stringify({ version: 1, paths: sorted }),
    'utf8',
  );
}

export async function addDeletedProjectRelpath(projectDir: string, relpath: string): Promise<void> {
  const normalized = normalizeProjectRelpath(relpath);
  if (!normalized) return;
  const paths = await readDeletedProjectRelpaths(projectDir);
  if (paths.has(normalized)) return;
  paths.add(normalized);
  await writeDeletedProjectRelpaths(projectDir, paths);
}

export async function removeDeletedProjectRelpath(projectDir: string, relpath: string): Promise<void> {
  const normalized = normalizeProjectRelpath(relpath);
  if (!normalized) return;
  const paths = await readDeletedProjectRelpaths(projectDir);
  if (!paths.has(normalized)) return;
  paths.delete(normalized);
  await writeDeletedProjectRelpaths(projectDir, paths);
}

export function filterDeletedProjectRelpaths<T extends { name?: string; path?: string }>(
  files: readonly T[],
  deleted: ReadonlySet<string>,
): T[] {
  if (!deleted.size) return [...files];
  return files.filter((file) => {
    const candidate = normalizeProjectRelpath(String(file.path ?? file.name ?? ''));
    return candidate && !deleted.has(candidate);
  });
}
