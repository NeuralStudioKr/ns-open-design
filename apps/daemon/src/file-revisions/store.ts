import path from 'node:path';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import {
  applySuffixPrefixPatch,
  decodePayload,
  gzipRevisionSnapshot,
  legacySnapshotFileName,
  shouldForceFullSnapshot,
  snapshotStorageFileName,
  type RevisionSnapshotKind,
} from './snapshot-codec.js';

function revisionDirForFile(projectDir: string, fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/').replace(/^\/+/, '');
  return path.join(projectDir, '.od', 'revisions', normalized);
}

function compressedSnapshotPath(projectDir: string, fileName: string, revisionId: string): string {
  return path.join(revisionDirForFile(projectDir, fileName), snapshotStorageFileName(revisionId));
}

function legacySnapshotPath(projectDir: string, fileName: string, revisionId: string): string {
  return path.join(revisionDirForFile(projectDir, fileName), legacySnapshotFileName(revisionId));
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export interface WriteRevisionSnapshotOptions {
  parentContent?: string | null;
  sequence?: number;
}

export interface WriteRevisionSnapshotResult {
  kind: RevisionSnapshotKind;
  storageBytes: number;
}

export async function writeRevisionSnapshot(
  projectDir: string,
  fileName: string,
  revisionId: string,
  content: string,
  options?: WriteRevisionSnapshotOptions,
): Promise<WriteRevisionSnapshotResult> {
  const target = compressedSnapshotPath(projectDir, fileName, revisionId);
  await mkdir(path.dirname(target), { recursive: true });
  const forceFull = options?.sequence != null
    ? shouldForceFullSnapshot(options.sequence)
    : options?.parentContent == null;
  const encoded = gzipRevisionSnapshot(content, {
    parentContent: options?.parentContent ?? null,
    forceFull,
  });
  await writeFile(target, encoded.compressed);
  await rm(legacySnapshotPath(projectDir, fileName, revisionId), { force: true });
  return {
    kind: encoded.kind,
    storageBytes: encoded.compressed.length,
  };
}

export async function readRevisionSnapshot(
  projectDir: string,
  fileName: string,
  revisionId: string,
  getParentRevisionId: (revisionId: string) => string | null,
): Promise<string> {
  const cache = new Map<string, string>();

  async function load(id: string): Promise<string> {
    const cached = cache.get(id);
    if (cached != null) return cached;

    const compressedPath = compressedSnapshotPath(projectDir, fileName, id);
    if (await pathExists(compressedPath)) {
      const compressed = await readFile(compressedPath);
      const decoded = decodePayload(gunzipSync(compressed));
      if (decoded.kind === 'full') {
        const content = decoded.content ?? '';
        cache.set(id, content);
        return content;
      }
      const parentRevisionId = getParentRevisionId(id);
      if (!parentRevisionId) {
        throw new Error(`Revision ${id} diff is missing parent revision id`);
      }
      if (!decoded.patch) {
        throw new Error(`Revision ${id} diff payload is missing patch body`);
      }
      const parent = await load(parentRevisionId);
      const content = applySuffixPrefixPatch(parent, decoded.patch);
      cache.set(id, content);
      return content;
    }

    const legacyPath = legacySnapshotPath(projectDir, fileName, id);
    if (await pathExists(legacyPath)) {
      const content = await readFile(legacyPath, 'utf8');
      cache.set(id, content);
      return content;
    }

    throw Object.assign(new Error(`Revision snapshot not found: ${id}`), { code: 'ENOENT' });
  }

  return load(revisionId);
}

export async function deleteRevisionSnapshot(
  projectDir: string,
  fileName: string,
  revisionId: string,
): Promise<void> {
  await rm(compressedSnapshotPath(projectDir, fileName, revisionId), { force: true });
  await rm(legacySnapshotPath(projectDir, fileName, revisionId), { force: true });
}

export async function deleteRevisionSnapshots(
  projectDir: string,
  fileName: string,
  revisionIds: string[],
): Promise<void> {
  await Promise.all(revisionIds.map((revisionId) => deleteRevisionSnapshot(projectDir, fileName, revisionId)));
}
