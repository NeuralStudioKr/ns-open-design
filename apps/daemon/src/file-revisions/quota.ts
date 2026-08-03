import type Database from 'better-sqlite3';
import { getPostgresPool } from '../storage/daemon-db-runtime.js';
import { deleteFileRevisionsByIdsDurable } from './durable-store.js';
import { FileRevisionPayloadTooLargeError } from './errors.js';
import {
  FILE_REVISION_ABSOLUTE_MAX_SNAPSHOT_BYTES,
  FILE_REVISION_MAX_SNAPSHOT_BYTES,
  FILE_REVISION_MAX_TOTAL_BYTES,
  FILE_REVISION_PUSH_PRUNE_MAX,
} from './limits.js';
import { pgListOldestRevisionsForPrune } from './postgres-persistence.js';
import {
  getFileRevisionSnapshotStorageStatsDurable,
  usesPostgresRevisionSnapshots,
} from './snapshot-storage.js';

export interface FileRevisionPruneResult {
  pruned: number;
  bytesReclaimed: number;
  deferredOverflowBytes: number;
}

interface PruneUntilBudgetOptions {
  excludeRevisionIds?: ReadonlySet<string>;
  /** When set, caps synchronous deletes (push path). GC passes no cap. */
  maxDeletes?: number;
}

/** Effective storage budget used when no explicit global cap is configured. */
export function resolveFileRevisionPruneBudgetBytes(incomingCompressedBytes: number): number {
  if (FILE_REVISION_MAX_TOTAL_BYTES > 0) return FILE_REVISION_MAX_TOTAL_BYTES;
  return Math.max(FILE_REVISION_MAX_SNAPSHOT_BYTES, incomingCompressedBytes);
}

export async function enforceFileRevisionGlobalByteBudget(
  db: Database.Database,
  incomingBytes: number,
  budgetBytes: number = FILE_REVISION_MAX_TOTAL_BYTES,
  excludeRevisionIds: ReadonlySet<string> = new Set(),
  options: Pick<PruneUntilBudgetOptions, 'maxDeletes'> = {},
): Promise<FileRevisionPruneResult> {
  if (!Number.isFinite(budgetBytes) || budgetBytes <= 0) {
    return { pruned: 0, bytesReclaimed: 0, deferredOverflowBytes: 0 };
  }
  return pruneOldestRevisionSnapshotsUntilWithinBudget(
    db,
    incomingBytes,
    budgetBytes,
    { excludeRevisionIds, ...options },
  );
}

/**
 * Make room for a new snapshot by pruning oldest revisions (other files first,
 * then older entries on the current file) instead of rejecting the push.
 * Deletes are batched and capped per push; remaining overflow is deferred to GC.
 */
export async function ensureRoomForIncomingRevisionSnapshot(
  db: Database.Database,
  incomingCompressedBytes: number,
  scope: { projectId: string; fileName: string; headRevisionId?: string | null },
): Promise<FileRevisionPruneResult> {
  const budgetBytes = resolveFileRevisionPruneBudgetBytes(incomingCompressedBytes);
  const excludeRevisionIds = new Set<string>();
  if (scope.headRevisionId) {
    excludeRevisionIds.add(scope.headRevisionId);
  }
  return pruneOldestRevisionSnapshotsUntilWithinBudget(
    db,
    incomingCompressedBytes,
    budgetBytes,
    { excludeRevisionIds, maxDeletes: FILE_REVISION_PUSH_PRUNE_MAX },
  );
}

export function assertRevisionSnapshotWithinAbsoluteLimit(uncompressedBytes: number): void {
  if (uncompressedBytes > FILE_REVISION_ABSOLUTE_MAX_SNAPSHOT_BYTES) {
    throw new FileRevisionPayloadTooLargeError(
      FILE_REVISION_ABSOLUTE_MAX_SNAPSHOT_BYTES,
      uncompressedBytes,
    );
  }
}

async function pruneOldestRevisionSnapshotsUntilWithinBudget(
  db: Database.Database,
  incomingBytes: number,
  budgetBytes: number,
  options: PruneUntilBudgetOptions = {},
): Promise<FileRevisionPruneResult> {
  const excludeRevisionIds = options.excludeRevisionIds ?? new Set<string>();
  const stats = await getFileRevisionSnapshotStorageStatsDurable(db);
  let overflowBytes = stats.totalSnapshotBytes + incomingBytes - budgetBytes;
  if (overflowBytes <= 0) {
    return { pruned: 0, bytesReclaimed: 0, deferredOverflowBytes: 0 };
  }

  const deleteCap = options.maxDeletes ?? 10_000;
  const candidates = await listOldestRevisionsForPrune(db, excludeRevisionIds, deleteCap);

  const idsToDelete: string[] = [];
  let bytesReclaimed = 0;
  for (const candidate of candidates) {
    if (overflowBytes <= 0 || idsToDelete.length >= deleteCap) break;
    idsToDelete.push(candidate.id);
    bytesReclaimed += candidate.storageBytes;
    overflowBytes -= candidate.storageBytes;
  }

  if (idsToDelete.length > 0) {
    await deleteFileRevisionsByIdsDurable(db, idsToDelete);
  }

  return {
    pruned: idsToDelete.length,
    bytesReclaimed,
    deferredOverflowBytes: Math.max(0, overflowBytes),
  };
}

async function listOldestRevisionsForPrune(
  db: Database.Database,
  excludeRevisionIds: ReadonlySet<string>,
  limit: number,
): Promise<Array<{ id: string; storageBytes: number }>> {
  if (limit <= 0) return [];
  if (usesPostgresRevisionSnapshots()) {
    return await pgListOldestRevisionsForPrune(getPostgresPool(), excludeRevisionIds, limit);
  }
  return listOldestRevisionsForPruneSqlite(db, excludeRevisionIds, limit);
}

function listOldestRevisionsForPruneSqlite(
  db: Database.Database,
  excludeRevisionIds: ReadonlySet<string>,
  limit: number,
): Array<{ id: string; storageBytes: number }> {
  const exclude = [...excludeRevisionIds];
  if (exclude.length === 0) {
    return db.prepare(`
      SELECT r.id AS id, coalesce(s.storage_bytes, 0) AS storageBytes
      FROM file_revisions r
      LEFT JOIN file_revision_snapshots s ON s.revision_id = r.id
      ORDER BY r.created_at ASC, r.sequence ASC
      LIMIT ?
    `).all(limit) as Array<{ id: string; storageBytes: number }>;
  }
  const placeholders = exclude.map(() => '?').join(', ');
  return db.prepare(`
    SELECT r.id AS id, coalesce(s.storage_bytes, 0) AS storageBytes
    FROM file_revisions r
    LEFT JOIN file_revision_snapshots s ON s.revision_id = r.id
    WHERE r.id NOT IN (${placeholders})
    ORDER BY r.created_at ASC, r.sequence ASC
    LIMIT ?
  `).all(...exclude, limit) as Array<{ id: string; storageBytes: number }>;
}
