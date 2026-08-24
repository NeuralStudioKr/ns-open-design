import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { statSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { getPostgresPool } from '../storage/daemon-db-runtime.js';
import { queryPostgresRow } from '../storage/daemon-db-postgres.js';
import {
  pruneOldestFileRevisionsDurable,
} from './durable-store.js';
import {
  deleteFileRevisionSnapshotsDurable,
  getFileRevisionSnapshotStorageStatsDurable,
  pruneOrphanFileRevisionSnapshotsDurable,
  resolveFileRevisionSnapshotStorage,
  usesPostgresRevisionSnapshots,
  type FileRevisionSnapshotStorage,
} from './snapshot-storage.js';
import {
  FILE_REVISION_RETENTION_LIMIT,
  listDistinctFileRevisionTargets,
  pruneOldestFileRevisions,
} from './persistence.js';
import {
  pgListAllFileRevisionIds,
  pgListDistinctFileRevisionTargets,
} from './postgres-persistence.js';
import { runDeferredRevisionSnapshotCompaction } from './compaction.js';
import { deleteRevisionSnapshots, removeRevisionSnapshotFiles } from './store.js';

export interface FileRevisionStorageStats {
  revisionRowCount: number;
  snapshotRowCount: number;
  orphanSnapshotRowCount: number;
  totalSnapshotBytes: number;
  diskSnapshotBytes?: number;
  storageMode: FileRevisionSnapshotStorage;
}

export interface FileRevisionGcOptions {
  db: Database.Database;
  projectsRoot: string;
  resolveProjectDir: (projectId: string) => string;
  retentionLimit?: number;
  now?: number;
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
  globalBudgetRevisionsPruned: number;
  globalBudgetBytesReclaimed: number;
  orphanFilesRemoved: number;
  vacuum: {
    beforeBytes: number;
    afterBytes: number;
    reclaimedBytes: number;
    elapsedMs: number;
  } | null;
}

export async function collectFileRevisionStorageStats(
  db: Database.Database,
  projectsRoot?: string,
): Promise<FileRevisionStorageStats> {
  const revisionRowCount = usesPostgresRevisionSnapshots()
    ? Number((await queryPostgresRow<{ c: string }>(
      getPostgresPool(),
      `SELECT count(*)::text AS c FROM file_revisions`,
    ))?.c ?? 0)
    : (
      db.prepare(`SELECT count(*) AS c FROM file_revisions`).get() as { c: number }
    ).c;
  const snapshotStats = await getFileRevisionSnapshotStorageStatsDurable(db);
  const diskSnapshotBytes = (
    resolveFileRevisionSnapshotStorage() === 'files' && projectsRoot
  )
    ? await sumRevisionSnapshotDiskBytes(projectsRoot)
    : 0;
  return {
    revisionRowCount,
    snapshotRowCount: snapshotStats.snapshotRowCount,
    orphanSnapshotRowCount: snapshotStats.orphanSnapshotRowCount,
    totalSnapshotBytes: snapshotStats.totalSnapshotBytes,
    diskSnapshotBytes,
    storageMode: resolveFileRevisionSnapshotStorage(),
  };
}

export async function deleteFileRevisionSnapshotsForProject(
  db: Database.Database,
  projectId: string,
): Promise<number> {
  const rows = db.prepare(`
    SELECT id FROM file_revisions WHERE project_id = ?
  `).all(projectId) as Array<{ id: string }>;
  await deleteFileRevisionSnapshotsDurable(rows.map((row) => row.id), db);
  return rows.length;
}

export async function enforceGlobalFileRevisionRetention(
  db: Database.Database,
  retentionLimit: number = FILE_REVISION_RETENTION_LIMIT,
): Promise<Array<{ projectId: string; fileName: string; revisionIds: string[] }>> {
  const targets = usesPostgresRevisionSnapshots()
    ? await pgListDistinctFileRevisionTargets(getPostgresPool())
    : listDistinctFileRevisionTargets(db);
  const batches: Array<{ projectId: string; fileName: string; revisionIds: string[] }> = [];
  for (const target of targets) {
    const revisionIds: string[] = [];
    while (true) {
      const pruned = usesPostgresRevisionSnapshots()
        ? await pruneOldestFileRevisionsDurable(db, target.projectId, target.fileName, retentionLimit)
        : pruneOldestFileRevisions(db, target.projectId, target.fileName, retentionLimit);
      if (pruned.length === 0) break;
      revisionIds.push(...pruned.map((revision) => revision.id));
    }
    if (revisionIds.length === 0) continue;
    batches.push({
      projectId: target.projectId,
      fileName: target.fileName,
      revisionIds,
    });
  }
  return batches;
}

async function pruneOrphanRevisionFilesOnDisk(
  projectsRoot: string,
  db: Database.Database,
): Promise<number> {
  const validIds = usesPostgresRevisionSnapshots()
    ? new Set(await pgListAllFileRevisionIds(getPostgresPool()))
    : new Set(
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

export async function sumRevisionSnapshotDiskBytes(projectsRoot: string): Promise<number> {
  let total = 0;
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
      total += statFileBytes(absPath);
    }
  }
  return total;
}

export async function deleteProjectRevisionSnapshotTree(
  projectsRoot: string,
  projectId: string,
): Promise<void> {
  await rm(path.join(projectsRoot, projectId, '.od', 'revisions'), { recursive: true, force: true });
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

  const orphan = await pruneOrphanFileRevisionSnapshotsDurable(db);
  const retentionBatches = await enforceGlobalFileRevisionRetention(db, retentionLimit);
  const globalBudget = await runDeferredRevisionSnapshotCompaction(db);
  let retentionRevisionsPruned = 0;
  for (const batch of retentionBatches) {
    retentionRevisionsPruned += batch.revisionIds.length;
    const projectDir = resolveProjectDir(batch.projectId);
    if (usesPostgresRevisionSnapshots()) {
      await Promise.all(
        batch.revisionIds.map((revisionId) => removeRevisionSnapshotFiles(projectDir, batch.fileName, revisionId)),
      );
    } else {
      await deleteFileRevisionSnapshotsDurable(batch.revisionIds, db);
      await deleteRevisionSnapshots(projectDir, batch.fileName, batch.revisionIds, { db });
    }
  }

  const orphanFilesRemoved = await pruneOrphanRevisionFilesOnDisk(projectsRoot, db);

  let vacuum: FileRevisionGcResult['vacuum'] = null;
  if (
    vacuumSqlite
    && resolveFileRevisionSnapshotStorage() === 'sqlite'
    && sqliteDbFile
    && (orphan.removed > 0 || retentionRevisionsPruned > 0)
  ) {
    vacuum = maybeVacuumSqliteDb(db, sqliteDbFile, orphan.reclaimedBytes, options);
  }

  return {
    orphanSnapshotsRemoved: orphan.removed,
    orphanSnapshotBytesReclaimed: orphan.reclaimedBytes,
    retentionRevisionsPruned,
    globalBudgetRevisionsPruned: globalBudget.pruned,
    globalBudgetBytesReclaimed: globalBudget.bytesReclaimed,
    orphanFilesRemoved,
    vacuum,
  };
}
