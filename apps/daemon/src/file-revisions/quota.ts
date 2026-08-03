import type Database from 'better-sqlite3';
import { getPostgresPool } from '../storage/daemon-db-runtime.js';
import { deleteFileRevisionsByIdsDurable } from './durable-store.js';
import { FILE_REVISION_MAX_TOTAL_BYTES } from './limits.js';
import { pgGetOldestRevisionForGlobalPrune } from './postgres-persistence.js';
import {
  getFileRevisionSnapshotStorageStatsDurable,
  usesPostgresRevisionSnapshots,
} from './snapshot-storage.js';

export async function enforceFileRevisionGlobalByteBudget(
  db: Database.Database,
  incomingBytes: number,
  budgetBytes: number = FILE_REVISION_MAX_TOTAL_BYTES,
): Promise<{ pruned: number; bytesReclaimed: number }> {
  if (!Number.isFinite(budgetBytes) || budgetBytes <= 0) {
    return { pruned: 0, bytesReclaimed: 0 };
  }

  let pruned = 0;
  let bytesReclaimed = 0;
  const maxIterations = 10_000;

  for (let i = 0; i < maxIterations; i += 1) {
    const stats = await getFileRevisionSnapshotStorageStatsDurable(db);
    if (stats.totalSnapshotBytes + incomingBytes <= budgetBytes) {
      return { pruned, bytesReclaimed };
    }

    const oldest = usesPostgresRevisionSnapshots()
      ? await pgGetOldestRevisionForGlobalPrune(getPostgresPool())
      : getOldestRevisionForGlobalPruneSqlite(db);
    if (!oldest) {
      return { pruned, bytesReclaimed };
    }

    await deleteFileRevisionsByIdsDurable(db, [oldest.id]);
    pruned += 1;
    bytesReclaimed += oldest.storageBytes;
  }

  return { pruned, bytesReclaimed };
}

function getOldestRevisionForGlobalPruneSqlite(
  db: Database.Database,
): { id: string; storageBytes: number } | null {
  const row = db.prepare(`
    SELECT r.id AS id, coalesce(s.storage_bytes, 0) AS storageBytes
    FROM file_revisions r
    LEFT JOIN file_revision_snapshots s ON s.revision_id = r.id
    ORDER BY r.created_at ASC, r.sequence ASC
    LIMIT 1
  `).get() as { id: string; storageBytes: number } | undefined;
  return row ?? null;
}
