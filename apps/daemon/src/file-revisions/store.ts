import path from 'node:path';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import type Database from 'better-sqlite3';
import type { FileRevision } from '@open-design/contracts';
import {
  applySuffixPrefixPatch,
  decodePayload,
  gzipRevisionSnapshot,
  legacySnapshotFileName,
  resolveFullSnapshotInterval,
  shouldForceFullSnapshot,
  snapshotStorageFileName,
  type RevisionSnapshotKind,
  type RevisionSnapshotPatch,
} from './snapshot-codec.js';
import {
  deleteFileRevisionSnapshotsDurable,
  deleteFileRevisionSnapshotsFromDb,
  getFileRevisionSnapshot,
  getFileRevisionSnapshotDurable,
  resolveFileRevisionSnapshotStorage,
  type FileRevisionSnapshotStorage,
  upsertFileRevisionSnapshot,
  upsertFileRevisionSnapshotDurable,
} from './snapshot-storage.js';

export type RevisionParentLookup = (revisionId: string) => string | null;

export type RevisionMetadataLookup = (revisionId: string) => Pick<FileRevision, 'id' | 'sequence' | 'parentRevisionId'> | null;

export interface RevisionSnapshotStoreContext {
  db?: Database.Database;
  storage?: FileRevisionSnapshotStorage;
}

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

function resolveStorageMode(context?: RevisionSnapshotStoreContext): FileRevisionSnapshotStorage {
  return context?.storage ?? resolveFileRevisionSnapshotStorage();
}

async function readCompressedFromFiles(
  projectDir: string,
  fileName: string,
  revisionId: string,
): Promise<Buffer | null> {
  const compressedPath = compressedSnapshotPath(projectDir, fileName, revisionId);
  if (await pathExists(compressedPath)) {
    return await readFile(compressedPath);
  }
  const legacyPath = legacySnapshotPath(projectDir, fileName, revisionId);
  if (await pathExists(legacyPath)) {
    const content = await readFile(legacyPath, 'utf8');
    return gzipRevisionSnapshot(content, { parentContent: null, forceFull: true }).compressed;
  }
  return null;
}

async function readCompressedSnapshot(
  projectDir: string,
  fileName: string,
  revisionId: string,
  context?: RevisionSnapshotStoreContext,
): Promise<Buffer | null> {
  const mode = resolveStorageMode(context);
  const db = context?.db;
  if (mode === 'postgres') {
    const fromPg = await getFileRevisionSnapshotDurable(revisionId, db);
    if (fromPg) return fromPg;
    return await readCompressedFromFiles(projectDir, fileName, revisionId);
  }
  if (mode === 'sqlite' && db) {
    const fromDb = getFileRevisionSnapshot(db, revisionId);
    if (fromDb) return fromDb;
    return await readCompressedFromFiles(projectDir, fileName, revisionId);
  }
  const fromFiles = await readCompressedFromFiles(projectDir, fileName, revisionId);
  if (fromFiles) return fromFiles;
  if (db) {
    return await getFileRevisionSnapshotDurable(revisionId, db);
  }
  return null;
}

export async function writeRevisionSnapshot(
  projectDir: string,
  fileName: string,
  revisionId: string,
  content: string,
  options?: WriteRevisionSnapshotOptions,
  context?: RevisionSnapshotStoreContext,
): Promise<WriteRevisionSnapshotResult> {
  const interval = resolveFullSnapshotInterval();
  const forceFull = options?.sequence != null
    ? shouldForceFullSnapshot(options.sequence, interval)
    : options?.parentContent == null;
  const encoded = gzipRevisionSnapshot(content, {
    parentContent: options?.parentContent ?? null,
    forceFull,
  });
  const mode = resolveStorageMode(context);
  const db = context?.db;

  if (mode === 'postgres') {
    await upsertFileRevisionSnapshotDurable(revisionId, encoded.compressed, db);
    await rm(compressedSnapshotPath(projectDir, fileName, revisionId), { force: true });
    await rm(legacySnapshotPath(projectDir, fileName, revisionId), { force: true });
    if (db) {
      deleteFileRevisionSnapshotsFromDb(db, [revisionId]);
    }
    return {
      kind: encoded.kind,
      storageBytes: encoded.compressed.length,
    };
  }

  if (mode === 'sqlite' && db) {
    upsertFileRevisionSnapshot(db, revisionId, encoded.compressed);
    await rm(compressedSnapshotPath(projectDir, fileName, revisionId), { force: true });
    await rm(legacySnapshotPath(projectDir, fileName, revisionId), { force: true });
    return {
      kind: encoded.kind,
      storageBytes: encoded.compressed.length,
    };
  }

  const target = compressedSnapshotPath(projectDir, fileName, revisionId);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, encoded.compressed);
  await rm(legacySnapshotPath(projectDir, fileName, revisionId), { force: true });
  if (db) {
    deleteFileRevisionSnapshotsFromDb(db, [revisionId]);
  }
  return {
    kind: encoded.kind,
    storageBytes: encoded.compressed.length,
  };
}

async function readSnapshotPayload(
  projectDir: string,
  fileName: string,
  revisionId: string,
  context?: RevisionSnapshotStoreContext,
): Promise<{ kind: 'full'; content: string } | { kind: 'diff'; patch: RevisionSnapshotPatch }> {
  const compressed = await readCompressedSnapshot(projectDir, fileName, revisionId, context);
  if (!compressed) {
    throw Object.assign(new Error(`Revision snapshot not found: ${revisionId}`), { code: 'ENOENT' });
  }
  const decoded = decodePayload(gunzipSync(compressed));
  if (decoded.kind === 'full') {
    return { kind: 'full', content: decoded.content ?? '' };
  }
  if (!decoded.patch) {
    throw new Error(`Revision ${revisionId} diff payload is missing patch body`);
  }
  return { kind: 'diff', patch: decoded.patch };
}

/** Oldest-first chain from nearest full checkpoint through target (inclusive). */
export function sliceRevisionChainFromCheckpoint(
  ancestryNewestFirst: Array<Pick<FileRevision, 'id' | 'sequence'>>,
  interval: number = resolveFullSnapshotInterval(),
): Array<Pick<FileRevision, 'id' | 'sequence'>> {
  if (ancestryNewestFirst.length === 0) return [];
  const oldestFirst = [...ancestryNewestFirst].reverse();
  let checkpointIndex = 0;
  for (let i = oldestFirst.length - 1; i >= 0; i -= 1) {
    if (!shouldForceFullSnapshot(oldestFirst[i]!.sequence, interval)) continue;
    checkpointIndex = i;
    break;
  }
  return oldestFirst.slice(checkpointIndex);
}

export async function readRevisionSnapshotFromChain(
  projectDir: string,
  fileName: string,
  chainOldestFirst: Array<Pick<FileRevision, 'id'>>,
  context?: RevisionSnapshotStoreContext,
): Promise<string> {
  if (chainOldestFirst.length === 0) {
    throw new Error('Revision snapshot chain is empty');
  }
  let content = '';
  for (const revision of chainOldestFirst) {
    const payload = await readSnapshotPayload(projectDir, fileName, revision.id, context);
    if (payload.kind === 'full') {
      content = payload.content;
    } else {
      content = applySuffixPrefixPatch(content, payload.patch);
    }
  }
  return content;
}

export async function readRevisionSnapshot(
  projectDir: string,
  fileName: string,
  revisionId: string,
  getParentRevisionId: RevisionParentLookup,
  getRevisionMetadata?: RevisionMetadataLookup,
  context?: RevisionSnapshotStoreContext,
): Promise<string> {
  if (getRevisionMetadata) {
    const ancestry: Array<Pick<FileRevision, 'id' | 'sequence'>> = [];
    let currentId: string | null = revisionId;
    const seen = new Set<string>();
    while (currentId) {
      if (seen.has(currentId)) break;
      seen.add(currentId);
      const revision = getRevisionMetadata(currentId);
      if (!revision) break;
      ancestry.push(revision);
      currentId = revision.parentRevisionId;
    }
    const chain = sliceRevisionChainFromCheckpoint(ancestry);
    return readRevisionSnapshotFromChain(projectDir, fileName, chain, context);
  }

  const cache = new Map<string, string>();

  async function load(id: string): Promise<string> {
    const cached = cache.get(id);
    if (cached != null) return cached;

    const payload = await readSnapshotPayload(projectDir, fileName, id, context);
    if (payload.kind === 'full') {
      cache.set(id, payload.content);
      return payload.content;
    }
    const parentRevisionId = getParentRevisionId(id);
    if (!parentRevisionId) {
      throw new Error(`Revision ${id} diff is missing parent revision id`);
    }
    const parent = await load(parentRevisionId);
    const content = applySuffixPrefixPatch(parent, payload.patch);
    cache.set(id, content);
    return content;
  }

  return load(revisionId);
}

export async function deleteRevisionSnapshot(
  projectDir: string,
  fileName: string,
  revisionId: string,
  context?: RevisionSnapshotStoreContext,
): Promise<void> {
  await rm(compressedSnapshotPath(projectDir, fileName, revisionId), { force: true });
  await rm(legacySnapshotPath(projectDir, fileName, revisionId), { force: true });
  await deleteFileRevisionSnapshotsDurable([revisionId], context?.db);
}

export async function deleteRevisionSnapshots(
  projectDir: string,
  fileName: string,
  revisionIds: string[],
  context?: RevisionSnapshotStoreContext,
): Promise<void> {
  if (revisionIds.length === 0) return;
  await Promise.all(revisionIds.map((revisionId) => deleteRevisionSnapshot(projectDir, fileName, revisionId, context)));
}
