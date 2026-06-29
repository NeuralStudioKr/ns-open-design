import type { ProjectStorage } from './project-storage.js';
import type { MaterializingProjectStorage } from './materializing-project-storage.js';

export type SyncUpCounts = {
  uploaded: number;
  skipped: number;
  failed: number;
};

function scratchEvictAfterRunEnabled(): boolean {
  return process.env.OD_SCRATCH_EVICT_AFTER_RUN === '1';
}

/** When `0` (default), BYOK proxy stream end keeps scratch warm for the next turn. */
function scratchEvictAfterByokTurnEnabled(): boolean {
  const raw = (process.env.OD_SCRATCH_EVICT_AFTER_BYOK_TURN ?? '').trim();
  return raw === '1' || raw.toLowerCase() === 'true';
}

/**
 * Run-end scratch eviction with S3 SSOT guard.
 *
 * Evicts when sync-up succeeded, remote already has objects, or a full
 * scratch upload (runStart=0 retry) persisted remaining files.
 * Retains scratch when files would be lost (scratch non-empty, remote empty).
 */
export async function safelyEvictScratchAfterRun(options: {
  storage: MaterializingProjectStorage;
  projectId: string;
  remote: ProjectStorage;
  runStartTimeMs: number;
  syncResult: SyncUpCounts;
  /** True for embed BYOK proxy streams (`byok-proxy-*` run ids). */
  isByokProxyRun?: boolean;
}): Promise<void> {
  const { storage, projectId, remote, runStartTimeMs, syncResult, isByokProxyRun } = options;

  if (!scratchEvictAfterRunEnabled()) return;

  if (isByokProxyRun && !scratchEvictAfterByokTurnEnabled()) {
    console.info(
      JSON.stringify({
        metric: 'od_scratch_evict_skipped_byok_turn',
        projectId,
        reason: 'OD_SCRATCH_EVICT_AFTER_BYOK_TURN=0',
      }),
    );
    return;
  }

  if (syncResult.failed > 0) {
    console.warn(
      `[project-materialization] retaining scratch for ${projectId}: ${syncResult.failed} S3 upload(s) failed`,
    );
    return;
  }

  const scratchFiles = await storage.listFiles(projectId);
  if (scratchFiles.length === 0) {
    await storage.evictScratchProject(projectId);
    return;
  }

  if (syncResult.uploaded > 0) {
    await storage.evictScratchProject(projectId);
    return;
  }

  const remoteFiles = await remote.listFiles(projectId);
  if (remoteFiles.length > 0) {
    await storage.evictScratchProject(projectId);
    return;
  }

  // Run-end filter skipped pre-run files (e.g. template seed) while S3 is still empty.
  const retry = await storage.syncUp(projectId, remote, 0);
  console.info(
    `[project-materialization] sync-up retry ${projectId}: uploaded=${retry.uploaded} skipped=${retry.skipped} failed=${retry.failed}`,
  );

  if (retry.failed > 0) {
    console.info(
      JSON.stringify({
        metric: 'od_s3_sync_up_failed',
        stage: 'run_end_retry',
        projectId,
        failed: retry.failed,
        uploaded: retry.uploaded,
        skipped: retry.skipped,
      }),
    );
    console.warn(
      `[project-materialization] retaining scratch for ${projectId}: full sync-up retry had ${retry.failed} failure(s)`,
    );
    return;
  }

  const remoteAfterRetry = await remote.listFiles(projectId);
  if (retry.uploaded > 0 || remoteAfterRetry.length > 0) {
    await storage.evictScratchProject(projectId);
    return;
  }

  if (scratchFiles.length > 0) {
    console.info(
      JSON.stringify({
        metric: 'od_scratch_evict_deferred',
        projectId,
        reason: 'scratch_has_files_remote_empty',
        scratchFiles: scratchFiles.length,
        runStartTimeMs,
      }),
    );
    console.warn(
      `[project-materialization] retaining scratch for ${projectId}: ${scratchFiles.length} local file(s) not yet in S3`,
    );
  }
}
