import type Database from 'better-sqlite3';
import { getPostgresPool } from '../storage/daemon-db-runtime.js';
import { deleteFileRevisionsByIdsDurable } from './durable-store.js';
import { FileRevisionPayloadTooLargeError } from './errors.js';
import {
  FILE_REVISION_ABSOLUTE_MAX_SNAPSHOT_BYTES,
  FILE_REVISION_MAX_SNAPSHOT_BYTES,
  FILE_REVISION_MAX_TOTAL_BYTES,
} from './limits.js';
import { pgGetOldestRevisionForPrune } from './postgres-persistence.js';
import {
  getFileRevisionSnapshotStorageStatsDurable,
  usesPostgresRevisionSnapshots,
} from './snapshot-storage.js';

export interface FileRevisionPruneResult {
  pruned: number;
  bytesReclaimed: number;
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
): Promise<FileRevisionPruneResult> {
  if (!Number.isFinite(budgetBytes) || budgetBytes <= 0) {
    return { pruned: 0, bytesReclaimed: 0 };
  }
  return pruneOldestRevisionSnapshotsUntilWithinBudget(
    db,
    incomingBytes,
    budgetBytes,
    excludeRevisionIds,
  );
}

/**
 * Make room for a new snapshot by pruning oldest revisions (other files first,
 * then older entries on the current file) instead of rejecting the push.
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
    excludeRevisionIds,
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
  excludeRevisionIds: ReadonlySet<string>,
): Promise<FileRevisionPruneResult> {
  let pruned = 0;
  let bytesReclaimed = 0;
  const maxIterations = 10_000;

  for (let i = 0; i < maxIterations; i += 1) {
    const stats = await getFileRevisionSnapshotStorageStatsDurable(db);
    if (stats.totalSnapshotBytes + incomingBytes <= budgetBytes) {
      return { pruned, bytesReclaimed };
    }

    const oldest = usesPostgresRevisionSnapshots()
      ? await pgGetOldestRevisionForPrune(getPostgresPool(), excludeRevisionIds)
      : getOldestRevisionForPruneSqlite(db, excludeRevisionIds);
    if (!oldest) {
      return { pruned, bytesReclaimed };
    }

    await deleteFileRevisionsByIdsDurable(db, [oldest.id]);
    pruned += 1;
    bytesReclaimed += oldest.storageBytes;
  }

  return { pruned, bytesReclaimed };
}

function getOldestRevisionForPruneSqlite(
  db: Database.Database,
  excludeRevisionIds: ReadonlySet<string>,
): { id: string; storageBytes: number } | null {
  const rows = db.prepare(`
    SELECT r.id AS id, coalesce(s.storage_bytes, 0) AS storageBytes
    FROM file_revisions r
    LEFT JOIN file_revision_snapshots s ON s.revision_id = r.id
    ORDER BY r.created_at ASC, r.sequence ASC
  `).all() as Array<{ id: string; storageBytes: number }>;
  for (const row of rows) {
    if (!excludeRevisionIds.has(row.id)) return row;
  }
  return null;
}
