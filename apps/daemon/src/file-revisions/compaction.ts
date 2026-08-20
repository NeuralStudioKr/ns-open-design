import type Database from 'better-sqlite3';
import { FILE_REVISION_RETENTION_LIMIT } from './persistence.js';
import { enforceFileRevisionGlobalByteBudget, type FileRevisionPruneResult } from './quota.js';
import {
  FILE_REVISION_MAX_SNAPSHOT_BYTES,
  FILE_REVISION_MAX_TOTAL_BYTES,
  FILE_REVISION_PUSH_PRUNE_MAX,
} from './limits.js';
import { getFileRevisionSnapshotStorageStatsDurable } from './snapshot-storage.js';

export interface DeferredCompactionOptions {
  /** Caps rows deleted in one pass. Push-triggered compaction uses PUSH_PRUNE_MAX; GC omits this. */
  maxDeletes?: number;
  /** When true and bytes remain over budget after a capped pass, queue another compaction. */
  rescheduleOnOverflow?: boolean;
}

/**
 * Background compaction for snapshot byte overflow. Push no longer blocks on
 * DELETE — this runs after successful pushes and from the periodic GC worker.
 */
export function scheduleRevisionSnapshotCompaction(): void {
  void import('./deferred-sweep.js').then(({ scheduleRevisionDeferredSweep }) => {
    scheduleRevisionDeferredSweep();
  });
}

export async function runDeferredRevisionSnapshotCompaction(
  db: Database.Database,
  options: DeferredCompactionOptions = {},
): Promise<FileRevisionPruneResult> {
  const pruneOptions = options.maxDeletes != null
    ? { maxDeletes: options.maxDeletes }
    : {};

  let result: FileRevisionPruneResult;
  if (FILE_REVISION_MAX_TOTAL_BYTES > 0) {
    result = await enforceFileRevisionGlobalByteBudget(
      db,
      0,
      FILE_REVISION_MAX_TOTAL_BYTES,
      new Set(),
      pruneOptions,
    );
  } else {
    const stats = await getFileRevisionSnapshotStorageStatsDurable(db);
    const softCap = FILE_REVISION_MAX_SNAPSHOT_BYTES * Math.max(FILE_REVISION_RETENTION_LIMIT, 4);
    if (stats.totalSnapshotBytes <= softCap) {
      return { pruned: 0, bytesReclaimed: 0, deferredOverflowBytes: 0 };
    }
    result = await enforceFileRevisionGlobalByteBudget(db, 0, softCap, new Set(), pruneOptions);
  }

  if (options.rescheduleOnOverflow && result.deferredOverflowBytes > 0) {
    queueMicrotask(() => scheduleRevisionSnapshotCompaction());
  }

  return result;
}
