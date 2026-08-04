import type Database from 'better-sqlite3';
import type { FileRevision } from '@open-design/contracts';
import { pruneOldestFileRevisionsDurableLimited } from './durable-store.js';
import {
  FILE_REVISION_RETENTION_LIMIT,
  pruneOldestFileRevisionsLimited,
} from './persistence.js';
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
  maxDeletes?: number;
  retentionLimit?: number;
  rescheduleOnOverflow?: boolean;
}

export interface RetentionSweepContext {
  db: Database.Database;
  projectsRoot: string;
  resolveProjectDir: ResolveProjectDir;
  snapshotContext: RevisionSnapshotStoreContext;
  postgresAuthority: boolean;
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
