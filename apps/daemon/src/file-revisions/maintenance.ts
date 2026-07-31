import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { statSync } from 'node:fs';
import type Database from 'better-sqlite3';
import {
  deleteFileRevisionSnapshotsFromDb,
  FILE_REVISION_SNAPSHOT_STORAGE,
  getFileRevisionSnapshotStorageStats,
} from './snapshot-storage.js';
import {
  FILE_REVISION_RETENTION_LIMIT,
  listDistinctFileRevisionTargets,
  pruneOldestFileRevisions,
} from './persistence.js';
import { deleteRevisionSnapshots } from './store.js';

export interface FileRevisionStorageStats {
  revisionRowCount: number;
  snapshotRowCount: number;
  orphanSnapshotRowCount: number;
  totalSnapshotBytes: number;
  storageMode: typeof FILE_REVISION_SNAPSHOT_STORAGE;
}

export interface FileRevisionGcOptions {
  db: Database.Database;
  projectsRoot: string;
  resolveProjectDir: (projectId: string) => string;
  retentionLimit?: number;
  now?: number;
  /** When true and storage mode is sqlite, run VACUUM if enough bytes were deleted since last vacuum. */
  vacuumSqlite?: boolean;
  sqliteDbFile?: string;
  lastVacuumAtMs?: number;
  vacuumMinIntervalMs?: number;
  vacuumMinReclaimedBytes?: number;
}

export interface FileRevisionGcResult {
  orphanSnapshotsRemoved: number;
  orphanSnapshotBytesReclaimed: number;
  retentionRevisionsPruned: number;
  orphanFilesRemoved: number;
  vacuum: {
    beforeBytes: number;
    afterBytes: number;
    reclaimedBytes: number;
    elapsedMs: number;
  } | null;
}

export function collectFileRevisionStorageStats(db: Database.Database): FileRevisionStorageStats {
  const revisionRowCount = (
    db.prepare(`SELECT count(*) AS c FROM file_revisions`).get() as { c: number }
  ).c;
  const snapshotStats = getFileRevisionSnapshotStorageStats(db);
  return {
    revisionRowCount,
    snapshotRowCount: snapshotStats.snapshotRowCount,
    orphanSnapshotRowCount: snapshotStats.orphanSnapshotRowCount,
    totalSnapshotBytes: snapshotStats.totalSnapshotBytes,
    storageMode: FILE_REVISION_SNAPSHOT_STORAGE,
  };
}

export function pruneOrphanFileRevisionSnapshotsInDb(db: Database.Database): {
  removed: number;
  reclaimedBytes: number;
} {
  const rows = db.prepare(`
    SELECT s.revision_id AS id, s.storage_bytes AS storageBytes
    FROM file_revision_snapshots s
    LEFT JOIN file_revisions r ON r.id = s.revision_id
    WHERE r.id IS NULL
  `).all() as Array<{ id: string; storageBytes: number }>;
  if (rows.length === 0) return { removed: 0, reclaimedBytes: 0 };
  const reclaimedBytes = rows.reduce((sum, row) => sum + (row.storageBytes ?? 0), 0);
  deleteFileRevisionSnapshotsFromDb(db, rows.map((row) => row.id));
  return { removed: rows.length, reclaimedBytes };
}

export function deleteFileRevisionSnapshotsForProject(
  db: Database.Database,
  projectId: string,
): number {
  const rows = db.prepare(`
    SELECT id FROM file_revisions WHERE project_id = ?
  `).all(projectId) as Array<{ id: string }>;
  if (rows.length === 0) return 0;
  deleteFileRevisionSnapshotsFromDb(db, rows.map((row) => row.id));
  return rows.length;
}

export function enforceGlobalFileRevisionRetention(
  db: Database.Database,
  retentionLimit: number = FILE_REVISION_RETENTION_LIMIT,
): Array<{ projectId: string; fileName: string; revisionIds: string[] }> {
  const targets = listDistinctFileRevisionTargets(db);
  const batches: Array<{ projectId: string; fileName: string; revisionIds: string[] }> = [];
  for (const target of targets) {
    const pruned = pruneOldestFileRevisions(db, target.projectId, target.fileName, retentionLimit);
    if (pruned.length === 0) continue;
    batches.push({
      projectId: target.projectId,
      fileName: target.fileName,
      revisionIds: pruned.map((revision) => revision.id),
    });
  }
  return batches;
}

async function pruneOrphanRevisionFilesOnDisk(
  projectsRoot: string,
  db: Database.Database,
): Promise<number> {
  const validIds = new Set(
    (db.prepare(`SELECT id FROM file_revisions`).all() as Array<{ id: string }>).map((row) => row.id),
  );
  let removed = 0;
  let projectEntries;
  try {
    projectEntries = await readdir(projectsRoot, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw err;
  }
  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) continue;
    const revisionsRoot = path.join(projectsRoot, projectEntry.name, '.od', 'revisions');
    let fileEntries;
    try {
      fileEntries = await walkRevisionSnapshotFiles(revisionsRoot);
    } catch {
      continue;
    }
    for (const absPath of fileEntries) {
      const base = path.basename(absPath);
      const revisionId = revisionIdFromSnapshotFilename(base);
      if (!revisionId || validIds.has(revisionId)) continue;
      await rm(absPath, { force: true });
      removed += 1;
    }
  }
  return removed;
}

async function walkRevisionSnapshotFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const dir = queue.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith('.snap.gz') || entry.name.endsWith('.html')) {
        out.push(abs);
      }
    }
  }
  return out;
}

function revisionIdFromSnapshotFilename(filename: string): string | null {
  if (filename.endsWith('.snap.gz')) {
    return filename.slice(0, -'.snap.gz'.length);
  }
  if (filename.endsWith('.html')) {
    return filename.slice(0, -'.html'.length);
  }
  return null;
}

function maybeVacuumSqliteDb(
  db: Database.Database,
  sqliteDbFile: string,
  reclaimedBytes: number,
  opts: Pick<FileRevisionGcOptions, 'lastVacuumAtMs' | 'vacuumMinIntervalMs' | 'vacuumMinReclaimedBytes' | 'now'>,
): FileRevisionGcResult['vacuum'] {
  const now = opts.now ?? Date.now();
  const minInterval = opts.vacuumMinIntervalMs ?? 24 * 60 * 60 * 1000;
  const minReclaimed = opts.vacuumMinReclaimedBytes ?? 10 * 1024 * 1024;
  if (reclaimedBytes < minReclaimed) return null;
  if (opts.lastVacuumAtMs != null && now - opts.lastVacuumAtMs < minInterval) return null;
  const startedAt = Date.now();
  const beforeBytes = statFileBytes(sqliteDbFile);
  db.exec('VACUUM');
  const afterBytes = statFileBytes(sqliteDbFile);
  return {
    beforeBytes,
    afterBytes,
    reclaimedBytes: Math.max(0, beforeBytes - afterBytes),
    elapsedMs: Date.now() - startedAt,
  };
}

function statFileBytes(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

export async function runFileRevisionGc(options: FileRevisionGcOptions): Promise<FileRevisionGcResult> {
  const {
    db,
    projectsRoot,
    resolveProjectDir,
    retentionLimit = FILE_REVISION_RETENTION_LIMIT,
    vacuumSqlite = false,
    sqliteDbFile,
  } = options;

  const orphan = pruneOrphanFileRevisionSnapshotsInDb(db);
  const retentionBatches = enforceGlobalFileRevisionRetention(db, retentionLimit);
  let retentionRevisionsPruned = 0;
  for (const batch of retentionBatches) {
    retentionRevisionsPruned += batch.revisionIds.length;
    deleteFileRevisionSnapshotsFromDb(db, batch.revisionIds);
    const projectDir = resolveProjectDir(batch.projectId);
    await deleteRevisionSnapshots(projectDir, batch.fileName, batch.revisionIds, { db });
  }

  const orphanFilesRemoved = await pruneOrphanRevisionFilesOnDisk(projectsRoot, db);

  const reclaimedBytes = orphan.reclaimedBytes;
  let vacuum: FileRevisionGcResult['vacuum'] = null;
  if (
    vacuumSqlite
    && FILE_REVISION_SNAPSHOT_STORAGE === 'sqlite'
    && sqliteDbFile
    && (orphan.removed > 0 || retentionRevisionsPruned > 0)
  ) {
    vacuum = maybeVacuumSqliteDb(db, sqliteDbFile, orphan.reclaimedBytes, options);
  }

  return {
    orphanSnapshotsRemoved: orphan.removed,
    orphanSnapshotBytesReclaimed: orphan.reclaimedBytes,
    retentionRevisionsPruned,
    orphanFilesRemoved,
    vacuum,
  };
}
