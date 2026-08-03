import type Database from 'better-sqlite3';
import { FILE_REVISION_RETENTION_LIMIT } from './persistence.js';
import { enforceFileRevisionGlobalByteBudget, type FileRevisionPruneResult } from './quota.js';
import { FILE_REVISION_MAX_SNAPSHOT_BYTES, FILE_REVISION_MAX_TOTAL_BYTES } from './limits.js';
import { getFileRevisionSnapshotStorageStatsDurable } from './snapshot-storage.js';

let compactionDb: Database.Database | null = null;
let compactionInFlight: Promise<void> | null = null;

export function registerRevisionCompactionDb(db: Database.Database): void {
  compactionDb = db;
}

/**
 * Background compaction for snapshot byte overflow. Push no longer blocks on
 * DELETE — this runs after successful pushes and from the periodic GC worker.
 */
export function scheduleRevisionSnapshotCompaction(): void {
  if (!compactionDb || compactionInFlight) return;
  compactionInFlight = runDeferredRevisionSnapshotCompaction(compactionDb)
    .then(() => undefined)
    .catch((err) => {
      console.warn(
        `[file-revisions] deferred compaction failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    })
    .finally(() => {
      compactionInFlight = null;
    });
}

export async function runDeferredRevisionSnapshotCompaction(
  db: Database.Database,
): Promise<FileRevisionPruneResult> {
  if (FILE_REVISION_MAX_TOTAL_BYTES > 0) {
    return enforceFileRevisionGlobalByteBudget(db, 0, FILE_REVISION_MAX_TOTAL_BYTES);
  }

  const stats = await getFileRevisionSnapshotStorageStatsDurable(db);
  const softCap = FILE_REVISION_MAX_SNAPSHOT_BYTES * Math.max(FILE_REVISION_RETENTION_LIMIT, 4);
  if (stats.totalSnapshotBytes <= softCap) {
    return { pruned: 0, bytesReclaimed: 0, deferredOverflowBytes: 0 };
  }

  return enforceFileRevisionGlobalByteBudget(db, 0, softCap);
}
