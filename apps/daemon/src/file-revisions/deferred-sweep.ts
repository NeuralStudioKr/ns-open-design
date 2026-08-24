import type Database from 'better-sqlite3';
import { FILE_REVISION_PUSH_PRUNE_MAX } from './limits.js';
import { updateFileRevisionDeferredMetrics } from './metrics.js';
import {
  runDeferredRevisionRetentionForTarget,
  type RetentionSweepContext,
} from './retention-sweep.js';

type CompactionModule = typeof import('./compaction.js');
let compactionModulePromise: Promise<CompactionModule> | null = null;

function loadCompactionModule(): Promise<CompactionModule> {
  compactionModulePromise ??= import('./compaction.js');
  return compactionModulePromise;
}

type ResolveProjectDir = (
  projectsRoot: string,
  projectId: string,
  metadata?: unknown,
) => string;

export interface RevisionDeferredSweepContext extends RetentionSweepContext {
  resolveProjectDir: ResolveProjectDir;
}

let sweepContext: RevisionDeferredSweepContext | null = null;
const pendingRetentionTargets = new Map<string, unknown | undefined>();
let pendingCompaction = false;
let sweepInFlight: Promise<void> | null = null;
const deferredExcessByTarget = new Map<string, number>();

export function registerRevisionDeferredSweep(context: RevisionDeferredSweepContext): void {
  sweepContext = context;
}

export function scheduleRevisionDeferredSweep(
  projectId?: string,
  fileName?: string,
  metadata?: unknown,
): void {
  if (!sweepContext) return;
  if (projectId && fileName) {
    pendingRetentionTargets.set(`${projectId}\0${fileName}`, metadata);
  }
  pendingCompaction = true;
  if (sweepInFlight) return;
  sweepInFlight = drainDeferredSweepQueue()
    .catch((err) => {
      console.warn(
        `[file-revisions] deferred sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    })
    .finally(() => {
      sweepInFlight = null;
      updateFileRevisionDeferredMetrics({
        queueDepth: pendingRetentionTargets.size + (pendingCompaction ? 1 : 0),
        retentionDeferredExcess: sumDeferredExcess(),
      });
    });
}

export function getFileRevisionRetentionDeferredExcess(
  projectId: string,
  fileName: string,
): number {
  return deferredExcessByTarget.get(`${projectId}\0${fileName}`) ?? 0;
}

export function isFileRevisionRetentionPending(
  projectId: string,
  fileName: string,
  revisionCount: number,
  retentionLimit: number,
): boolean {
  return revisionCount > retentionLimit || getFileRevisionRetentionDeferredExcess(projectId, fileName) > 0;
}

export async function runRevisionDeferredSweep(
  context: RevisionDeferredSweepContext,
  options: { maxDeletes?: number; uncapped?: boolean } = {},
): Promise<void> {
  const maxDeletes = options.uncapped
    ? Number.POSITIVE_INFINITY
    : (options.maxDeletes ?? FILE_REVISION_PUSH_PRUNE_MAX);

  const retentionTargets = [...pendingRetentionTargets.entries()];
  pendingRetentionTargets.clear();

  for (const [key, metadata] of retentionTargets) {
    const [projectId, fileName] = key.split('\0');
    if (!projectId || !fileName) continue;
    const result = await runDeferredRevisionRetentionForTarget(
      context,
      projectId,
      fileName,
      metadata,
      { maxDeletes, rescheduleOnOverflow: false },
    );
    if (result.deferredExcess > 0) {
      deferredExcessByTarget.set(key, result.deferredExcess);
      if (result.pruned > 0) {
        pendingRetentionTargets.set(key, metadata);
      }
    } else {
      deferredExcessByTarget.delete(key);
    }
  }

  if (pendingCompaction) {
    pendingCompaction = false;
    const { runDeferredRevisionSnapshotCompaction } = await loadCompactionModule();
    await runDeferredRevisionSnapshotCompaction(
      context.db,
      options.uncapped
        ? { rescheduleOnOverflow: false }
        : { maxDeletes, rescheduleOnOverflow: true },
    );
  }

  updateFileRevisionDeferredMetrics({
    queueDepth: pendingRetentionTargets.size + (pendingCompaction ? 1 : 0),
    retentionDeferredExcess: sumDeferredExcess(),
  });
}

async function drainDeferredSweepQueue(): Promise<void> {
  if (!sweepContext) return;
  while (pendingRetentionTargets.size > 0 || pendingCompaction) {
    await runRevisionDeferredSweep(sweepContext, { maxDeletes: FILE_REVISION_PUSH_PRUNE_MAX });
    if (pendingRetentionTargets.size === 0 && !pendingCompaction) break;
  }
}

function sumDeferredExcess(): number {
  let total = 0;
  for (const excess of deferredExcessByTarget.values()) {
    total += excess;
  }
  return total;
}

/** @deprecated Use scheduleRevisionDeferredSweep */
export function scheduleRevisionRetentionSweep(
  projectId: string,
  fileName: string,
  metadata?: unknown,
): void {
  scheduleRevisionDeferredSweep(projectId, fileName, metadata);
}

/** @deprecated Use scheduleRevisionDeferredSweep */
export function scheduleRevisionSnapshotCompaction(): void {
  scheduleRevisionDeferredSweep();
}
