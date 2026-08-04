import type Database from 'better-sqlite3';
import type { FileRevision } from '@open-design/contracts';
import { pruneOldestFileRevisionsDurableLimited } from './durable-store.js';
import {
  FILE_REVISION_RETENTION_LIMIT,
  pruneOldestFileRevisionsLimited,
} from './persistence.js';
import { FILE_REVISION_PUSH_PRUNE_MAX } from './limits.js';
import {
  deleteRevisionSnapshots,
  removeRevisionSnapshotFiles,
  type RevisionSnapshotStoreContext,
} from './store.js';
import { usesPostgresRevisionSnapshots } from './snapshot-storage.js';

type ResolveProjectDir = (
  projectsRoot: string,
  projectId: string,
  metadata?: unknown,
) => string;

export interface RevisionRetentionSweepResult {
  pruned: number;
  /** Rows still over the per-file retention cap after this pass. */
  deferredExcess: number;
}

export interface DeferredRetentionSweepOptions {
  /** Caps rows deleted in one pass. Push-triggered sweeps use PUSH_PRUNE_MAX; GC omits this. */
  maxDeletes?: number;
  retentionLimit?: number;
  /** When true and rows remain over retention after a capped pass, queue another sweep. */
  rescheduleOnOverflow?: boolean;
}

interface RetentionSweepContext {
  db: Database.Database;
  projectsRoot: string;
  resolveProjectDir: ResolveProjectDir;
  snapshotContext: RevisionSnapshotStoreContext;
  postgresAuthority: boolean;
}

let sweepContext: RetentionSweepContext | null = null;
const pendingTargets = new Map<string, unknown | undefined>();
let sweepInFlight: Promise<void> | null = null;

export function registerRevisionRetentionSweep(context: RetentionSweepContext): void {
  sweepContext = context;
}

/**
 * Deferred per-file count retention. Push no longer blocks on DELETE — this runs
 * after successful pushes and from the periodic GC worker.
 */
export function scheduleRevisionRetentionSweep(
  projectId: string,
  fileName: string,
  metadata?: unknown,
): void {
  if (!sweepContext) return;
  pendingTargets.set(`${projectId}\0${fileName}`, metadata);
  if (sweepInFlight) return;
  sweepInFlight = drainRetentionSweepQueue()
    .catch((err) => {
      console.warn(
        `[file-revisions] deferred retention sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    })
    .finally(() => {
      sweepInFlight = null;
    });
}

export async function runDeferredRevisionRetentionForTarget(
  context: RetentionSweepContext,
  projectId: string,
  fileName: string,
  metadata: unknown | undefined,
  options: DeferredRetentionSweepOptions = {},
): Promise<RevisionRetentionSweepResult> {
  const retentionLimit = options.retentionLimit ?? FILE_REVISION_RETENTION_LIMIT;
  const maxDeletes = options.maxDeletes ?? Number.POSITIVE_INFINITY;
  const projectDir = context.resolveProjectDir(context.projectsRoot, projectId, metadata);

  const { revisions: pruned, remainingExcess } = context.postgresAuthority
    ? await pruneOldestFileRevisionsDurableLimited(
      context.db,
      projectId,
      fileName,
      retentionLimit,
      maxDeletes,
    )
    : pruneOldestFileRevisionsLimited(
      context.db,
      projectId,
      fileName,
      retentionLimit,
      maxDeletes,
    );

  await pruneRevisionSnapshots(context, projectDir, fileName, pruned);

  return {
    pruned: pruned.length,
    deferredExcess: remainingExcess,
  };
}

export async function runDeferredRevisionRetentionSweep(
  context: RetentionSweepContext,
  options: DeferredRetentionSweepOptions = {},
): Promise<RevisionRetentionSweepResult> {
  const targets = [...pendingTargets.entries()];
  pendingTargets.clear();

  let pruned = 0;
  let deferredExcess = 0;
  for (const [key, metadata] of targets) {
    const [projectId, fileName] = key.split('\0');
    if (!projectId || !fileName) continue;
    const result = await runDeferredRevisionRetentionForTarget(
      context,
      projectId,
      fileName,
      metadata,
      options,
    );
    pruned += result.pruned;
    deferredExcess = Math.max(deferredExcess, result.deferredExcess);
    if (result.deferredExcess > 0) {
      scheduleRevisionRetentionSweep(projectId, fileName, metadata);
    }
  }

  return { pruned, deferredExcess };
}

async function drainRetentionSweepQueue(): Promise<void> {
  if (!sweepContext) return;
  while (pendingTargets.size > 0) {
    const result = await runDeferredRevisionRetentionSweep(sweepContext, {
      maxDeletes: FILE_REVISION_PUSH_PRUNE_MAX,
      rescheduleOnOverflow: true,
    });
    if (result.deferredExcess <= 0) break;
  }
}

async function pruneRevisionSnapshots(
  context: RetentionSweepContext,
  projectDir: string,
  fileName: string,
  revisions: FileRevision[],
): Promise<void> {
  if (revisions.length === 0) return;
  if (context.postgresAuthority) {
    await Promise.all(
      revisions.map((revision) => removeRevisionSnapshotFiles(projectDir, fileName, revision.id)),
    );
    return;
  }
  await deleteRevisionSnapshots(
    projectDir,
    fileName,
    revisions.map((revision) => revision.id),
    context.snapshotContext,
  );
}
