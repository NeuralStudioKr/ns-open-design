import type { ProjectStorage } from './project-storage.js';
import type { MaterializingProjectStorage } from './materializing-project-storage.js';
import {
  isS3ProjectStorageLayout,
  type ProjectStorageLayout,
} from './project-storage-layout.js';
import {
  resolveTeamverTenantRemoteStorage,
  type TeamverRequestIdentity,
} from './teamver-project-storage-meta.js';
import {
  buildScratchDiskUsageMarker,
  measureScratchDiskUsage,
  scratchDiskMetricsEnabled,
} from './scratch-disk-usage.js';
import {
  evictIdleScratchProjects,
  scratchIdleEvictAfterMs,
  scratchIdleEvictEnabled,
} from './scratch-idle-eviction.js';
import { safelyEvictScratchAfterRun } from './scratch-evict-policy.js';

type RunLike = {
  id?: string;
  projectId?: string | null;
  projectMaterializationStartedAt?: number;
  teamverIdentity?: TeamverRequestIdentity | null;
  teamverS3Prefix?: string | null;
  teamverRemote?: ProjectStorage | null;
};

type SyncUpResult = {
  uploaded: number;
  skipped: number;
  failed: number;
  deleted: number;
};

export type ProjectMaterializationRuntime = {
  layout: ProjectStorageLayout;
  storage: MaterializingProjectStorage | null;
  beforeChatRun: (run: RunLike) => Promise<void>;
  /** Run-end sync-up — also used by BYOK proxy stream finish hooks. */
  afterChatRun: (run: RunLike) => Promise<void>;
  wrapFinish: <T extends (...args: unknown[]) => unknown>(finish: T) => T;
  withProjectLock: <T>(projectId: string, fn: () => Promise<T>) => Promise<T>;
  markProjectSyncFailed: (projectId: string) => void;
  clearProjectSyncFailed: (projectId: string) => void;
  isProjectSyncFailed: (projectId: string) => boolean;
  /**
   * Long-lived (project_id → tenant remote) cache populated by request-scoped
   * resolves (lazy materialization, beforeChatRun). Idle-evict uses this to
   * sync-up without a request context. Safe to cache forever because
   * design_projects.s3_prefix is immutable per project — drop entries only
   * when the project itself is removed (via `forgetProjectRemote`).
   */
  rememberProjectRemote: (projectId: string, remote: ProjectStorage) => void;
  getProjectRemote: (projectId: string) => ProjectStorage | undefined;
  /** Clear the sticky remote cache entry (call from project delete hooks). */
  forgetProjectRemote: (projectId: string) => void;
  /** Stops the optional scratch disk-usage interval timer (no-op when disabled). */
  dispose: () => void;
};

function runEndSyncUpRetryAttempts(): number {
  const parsed = Number(process.env.OD_S3_RUN_END_SYNC_UP_RETRIES ?? '');
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 2;
}

function runEndSyncUpRetryMs(): number {
  const parsed = Number(process.env.OD_S3_RUN_END_SYNC_UP_RETRY_MS ?? '');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createProjectMaterializationRuntime(
  layout: ProjectStorageLayout,
  storage: MaterializingProjectStorage | null,
): ProjectMaterializationRuntime {
  const activeProjectRuns = new Map<string, number>();
  const projectLocks = new Map<string, Promise<void>>();
  /** Earliest materialization start among overlapping runs — sync-up floor. */
  const projectSyncFloorMs = new Map<string, number>();
  /** Tenant-scoped remote resolved by the first active run on a project. */
  const projectTenantRemote = new Map<string, ProjectStorage>();
  /**
   * Sticky remote cache keyed by projectId — survives run boundaries so that
   * the idle-evict sweep (which has no request context) can flush scratch to
   * S3 before deletion. design_projects.s3_prefix is immutable per project,
   * so the mapping is deterministic and safe to cache for the daemon lifetime.
   */
  const projectStickyRemote = new Map<string, ProjectStorage>();
  /** Projects whose last sync-up reported failures — idle evict must retain scratch. */
  const projectSyncFailed = new Set<string>();

  function rememberProjectRemote(projectId: string, remote: ProjectStorage): void {
    const id = projectId.trim();
    if (!id) return;
    projectStickyRemote.set(id, remote);
  }

  function getProjectRemote(projectId: string): ProjectStorage | undefined {
    return projectStickyRemote.get(projectId.trim());
  }

  function forgetProjectRemote(projectId: string): void {
    const id = projectId.trim();
    if (!id) return;
    projectStickyRemote.delete(id);
  }

  function markProjectSyncFailed(projectId: string): void {
    const id = projectId.trim();
    if (id) projectSyncFailed.add(id);
  }

  function clearProjectSyncFailed(projectId: string): void {
    const id = projectId.trim();
    if (id) projectSyncFailed.delete(id);
  }

  function isProjectSyncFailed(projectId: string): boolean {
    return projectSyncFailed.has(projectId.trim());
  }

  function trackSyncFloor(projectId: string, startedAt: number): void {
    const floor = projectSyncFloorMs.get(projectId);
    projectSyncFloorMs.set(projectId, floor === undefined ? startedAt : Math.min(floor, startedAt));
  }

  async function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const previous = projectLocks.get(projectId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    projectLocks.set(projectId, previous.then(() => gate));
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (projectLocks.get(projectId) === gate) {
        projectLocks.delete(projectId);
      }
    }
  }

  async function resolveRunRemote(run: RunLike, projectId: string): Promise<ProjectStorage> {
    if (!storage) throw new Error('materializing storage unavailable');
    if (run.teamverRemote) return run.teamverRemote;

    const resolved = await resolveTeamverTenantRemoteStorage(
      projectId,
      run.teamverIdentity,
      (objectPrefix) => storage.remoteForTenantPrefix(objectPrefix),
      () => storage.flatRemote(),
      run.teamverS3Prefix,
    );
    run.teamverS3Prefix = resolved.s3Prefix;
    run.teamverRemote = resolved.remote;
    return resolved.remote;
  }

  async function syncUpAfterChatRunWithRetry(
    projectId: string,
    remote: ProjectStorage,
    startedAt: number,
    run: RunLike,
  ): Promise<SyncUpResult> {
    const maxAttempts = runEndSyncUpRetryAttempts();
    let lastErr: unknown;
    let lastResult: SyncUpResult | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await storage!.syncUp(projectId, remote, startedAt);
        lastResult = result;
        if (result.failed === 0 || attempt >= maxAttempts) {
          return result;
        }
        console.warn(
          `[project-materialization] retrying run-end sync-up for ${projectId} (${attempt}/${maxAttempts}) after ${result.failed} failed upload(s)`,
        );
        if (process.env.OD_S3_SYNC_UP_METRICS === '1') {
          console.info(
            JSON.stringify({
              metric: 'od_s3_run_end_sync_up_retry',
              projectId,
              runId: typeof run.id === 'string' ? run.id : undefined,
              attempt,
              maxAttempts,
              failed: result.failed,
              uploaded: result.uploaded,
              skipped: result.skipped,
            }),
          );
        }
        await sleep(runEndSyncUpRetryMs() * attempt);
      } catch (err) {
        lastErr = err;
        if (attempt >= maxAttempts) break;
        console.warn(
          `[project-materialization] retrying run-end sync-up for ${projectId} (${attempt}/${maxAttempts}) after exception:`,
          err instanceof Error ? err.message : err,
        );
        if (process.env.OD_S3_SYNC_UP_METRICS === '1') {
          console.info(
            JSON.stringify({
              metric: 'od_s3_run_end_sync_up_retry',
              projectId,
              runId: typeof run.id === 'string' ? run.id : undefined,
              attempt,
              maxAttempts,
              reason: err instanceof Error ? err.message : String(err),
            }),
          );
        }
        await sleep(runEndSyncUpRetryMs() * attempt);
      }
    }
    if (lastResult) return lastResult;
    throw lastErr;
  }

  async function beforeChatRun(run: RunLike): Promise<void> {
    if (!storage || !isS3ProjectStorageLayout(layout)) return;
    const projectId = typeof run.projectId === 'string' ? run.projectId.trim() : '';
    if (!projectId) return;

    const active = activeProjectRuns.get(projectId) ?? 0;
    if (active > 0) {
      console.warn(
        `[project-materialization] concurrent run on ${projectId} — v1 allows one materialized run; skipping sync-down`,
      );
      activeProjectRuns.set(projectId, active + 1);
      const now = Date.now();
      run.projectMaterializationStartedAt = now;
      trackSyncFloor(projectId, now);
      const cachedRemote = projectTenantRemote.get(projectId);
      if (cachedRemote) {
        run.teamverRemote = cachedRemote;
      } else {
        const remote = await resolveRunRemote(run, projectId);
        projectTenantRemote.set(projectId, remote);
        rememberProjectRemote(projectId, remote);
      }
      return;
    }

    activeProjectRuns.set(projectId, 1);
    const remote = await resolveRunRemote(run, projectId);
    projectTenantRemote.set(projectId, remote);
    rememberProjectRemote(projectId, remote);
    await withProjectLock(projectId, async () => {
      const syncDownStarted = Date.now();
      const result = await storage.syncDown(projectId, remote);
      const prefixNote = run.teamverS3Prefix ? ` prefix=${run.teamverS3Prefix}` : '';
      console.info(
        `[project-materialization] sync-down ${projectId}: ${result.files} file(s)${prefixNote}`,
      );
      if (process.env.OD_S3_SYNC_UP_METRICS === '1') {
        console.info(
          JSON.stringify({
            metric: 'od_s3_sync_down',
            projectId,
            files: result.files,
            durationMs: Date.now() - syncDownStarted,
            runId: typeof run.id === 'string' ? run.id : undefined,
          }),
        );
      }
    });
    const startedAt = Date.now();
    run.projectMaterializationStartedAt = startedAt;
    trackSyncFloor(projectId, startedAt);
  }

  async function afterChatRun(run: RunLike): Promise<void> {
    if (!storage || !isS3ProjectStorageLayout(layout)) return;
    const projectId = typeof run.projectId === 'string' ? run.projectId.trim() : '';
    if (!projectId) return;

    const startedAt = projectSyncFloorMs.get(projectId)
      ?? run.projectMaterializationStartedAt
      ?? Date.now();
    const active = activeProjectRuns.get(projectId) ?? 0;
    if (active <= 1) {
      activeProjectRuns.delete(projectId);
      projectSyncFloorMs.delete(projectId);
      const remote = run.teamverRemote
        ?? projectTenantRemote.get(projectId)
        ?? await resolveRunRemote(run, projectId);
      projectTenantRemote.delete(projectId);
      await withProjectLock(projectId, async () => {
        try {
          const result = await syncUpAfterChatRunWithRetry(projectId, remote, startedAt, run);
          console.info(
            `[project-materialization] sync-up ${projectId}: uploaded=${result.uploaded} skipped=${result.skipped} failed=${result.failed}`,
          );
          if (result.failed > 0) {
            // Structured marker for CloudWatch log metric filter (09 P1-10).
            console.info(
              JSON.stringify({
                metric: 'od_s3_sync_up_failed',
                stage: 'run_end',
                projectId,
                runId: typeof run.id === 'string' ? run.id : undefined,
                failed: result.failed,
                uploaded: result.uploaded,
                skipped: result.skipped,
              }),
            );
          }
          if (result.failed > 0) {
            markProjectSyncFailed(projectId);
          }
          await safelyEvictScratchAfterRun({
            storage,
            projectId,
            remote,
            runStartTimeMs: startedAt,
            syncResult: result,
          });
          if (result.failed === 0) {
            clearProjectSyncFailed(projectId);
          }
          await emitScratchDiskUsageMarker(layout, run, projectId, 'run_end');
        } catch (err) {
          // sync-up threw outright (e.g. remote unreachable, signing failure).
          // Surface the same CW marker as per-file failures so the alarm
          // catches catastrophic uploads, not just partial.
          console.info(
            JSON.stringify({
              metric: 'od_s3_sync_up_failed',
              stage: 'run_end_exception',
              projectId,
              runId: typeof run.id === 'string' ? run.id : undefined,
              reason: err instanceof Error ? err.message : String(err),
            }),
          );
          console.warn(
            `[project-materialization] sync-up failed for ${projectId}:`,
            err instanceof Error ? err.message : err,
          );
          await emitScratchDiskUsageMarker(layout, run, projectId, 'run_end_exception');
        }
      });
      return;
    }

    activeProjectRuns.set(projectId, active - 1);
  }

  function wrapFinish<T extends (...args: unknown[]) => unknown>(finish: T): T {
    return ((run: RunLike, ...rest: unknown[]) => {
      const result = finish(run, ...rest);
      void afterChatRun(run);
      return result;
    }) as T;
  }

  async function emitScratchDiskUsageMarker(
    layoutArg: ProjectStorageLayout,
    run: RunLike,
    projectId: string,
    stage: string,
  ): Promise<void> {
    if (!scratchDiskMetricsEnabled()) return;
    if (!isS3ProjectStorageLayout(layoutArg)) return;
    try {
      const sample = await measureScratchDiskUsage(layoutArg.scratchDir);
      const runId = typeof run.id === 'string' && run.id ? run.id : undefined;
      const args: Parameters<typeof buildScratchDiskUsageMarker>[0] = {
        sample,
        stage,
        projectId,
      };
      if (runId !== undefined) args.runId = runId;
      const marker = buildScratchDiskUsageMarker(args);
      console.info(JSON.stringify(marker));
    } catch (err) {
      console.warn(
        '[project-materialization] scratch disk-usage probe failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  /**
   * Pre-evict S3 flush for the idle scratch sweep.
   *
   * Why this exists: the BYOK chat path bypasses `POST /api/runs` and never
   * triggers `afterChatRun`, so files written to scratch (via tool calls,
   * direct file POSTs that didn't materialize, or proxy artifacts) can sit
   * unsynced. Without this guard, idle-evict deletes the only copy and the
   * project becomes unrecoverable. We refuse to evict unless scratch was
   * already empty or we successfully push everything to S3 first.
   */
  async function syncUpForIdleEvict(projectId: string): Promise<{
    ok: boolean;
    uploaded: number;
    failed: number;
    reason?: string;
  }> {
    if (!storage || !isS3ProjectStorageLayout(layout)) {
      return { ok: true, uploaded: 0, failed: 0 };
    }
    const id = projectId.trim();
    if (!id) return { ok: true, uploaded: 0, failed: 0 };

    let scratchFiles: Awaited<ReturnType<typeof storage.listFiles>>;
    try {
      scratchFiles = await storage.listFiles(id);
    } catch (err) {
      return {
        ok: false,
        uploaded: 0,
        failed: 0,
        reason: err instanceof Error ? err.message : 'scratch_list_failed',
      };
    }
    if (scratchFiles.length === 0) {
      // Nothing to lose — empty scratch directory can be safely removed.
      return { ok: true, uploaded: 0, failed: 0 };
    }

    const remote = projectStickyRemote.get(id);
    if (!remote) {
      // No request ever resolved a tenant remote for this project; we have
      // no way to know which S3 prefix is authoritative. Refuse to evict.
      return {
        ok: false,
        uploaded: 0,
        failed: 0,
        reason: 'no_cached_remote',
      };
    }

    try {
      const result = await storage.syncUp(id, remote, 0);
      if (result.failed > 0) {
        markProjectSyncFailed(id);
        console.info(
          JSON.stringify({
            metric: 'od_s3_sync_up_failed',
            stage: 'idle_evict',
            projectId: id,
            failed: result.failed,
            uploaded: result.uploaded,
            skipped: result.skipped,
          }),
        );
        return {
          ok: false,
          uploaded: result.uploaded,
          failed: result.failed,
          reason: 'sync_up_failed',
        };
      }
      clearProjectSyncFailed(id);
      if (result.uploaded > 0) {
        console.info(
          `[project-materialization] idle-evict sync-up ${id}: uploaded=${result.uploaded} skipped=${result.skipped}`,
        );
      }
      return { ok: true, uploaded: result.uploaded, failed: 0 };
    } catch (err) {
      markProjectSyncFailed(id);
      console.info(
        JSON.stringify({
          metric: 'od_s3_sync_up_failed',
          stage: 'idle_evict_exception',
          projectId: id,
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
      return {
        ok: false,
        uploaded: 0,
        failed: 0,
        reason: err instanceof Error ? err.message : 'sync_up_exception',
      };
    }
  }

  async function emitPeriodicScratchDiskUsageMarker(scratchDir: string, stage = 'periodic'): Promise<void> {
    try {
      const sample = await measureScratchDiskUsage(scratchDir);
      const marker = buildScratchDiskUsageMarker({ sample, stage });
      console.info(JSON.stringify(marker));
    } catch (err) {
      console.warn(
        `[project-materialization] scratch disk-usage ${stage} probe failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Optional periodic sampler: scratch disk usage + idle project eviction.
  let periodicTimer: NodeJS.Timeout | null = null;
  let disposed = false;
  const metricsEnabled = isS3ProjectStorageLayout(layout) && scratchDiskMetricsEnabled();
  const idleEvictEnabled = isS3ProjectStorageLayout(layout) && scratchIdleEvictEnabled();
  if (metricsEnabled || idleEvictEnabled) {
    const raw = (process.env.OD_SCRATCH_DISK_METRIC_INTERVAL_MS ?? '').trim();
    const intervalMs = raw ? Number(raw) : 5 * 60 * 1000;
    if (Number.isFinite(intervalMs) && intervalMs > 0) {
      const scratchDir = isS3ProjectStorageLayout(layout) ? layout.scratchDir : '';
      const projectsDir = isS3ProjectStorageLayout(layout) ? layout.projectsDir : '';
      periodicTimer = setInterval(() => {
        if (metricsEnabled && scratchDir) {
          void emitPeriodicScratchDiskUsageMarker(scratchDir);
        }
        if (idleEvictEnabled && storage && projectsDir) {
          void evictIdleScratchProjects({
            projectsDir,
            storage,
            isActiveProject: (projectId) => (activeProjectRuns.get(projectId) ?? 0) > 0,
            shouldSkipEvict: (projectId) => isProjectSyncFailed(projectId),
            syncUpBeforeEvict: (projectId) => syncUpForIdleEvict(projectId),
            idleAfterMs: scratchIdleEvictAfterMs(),
            withProjectLock: (projectId, fn) => withProjectLock(projectId, fn),
          }).catch((err) => {
            console.warn(
              '[project-materialization] idle scratch evict sweep failed:',
              err instanceof Error ? err.message : err,
            );
          });
        }
      }, intervalMs);
      // Don't block process exit on this metric timer.
      if (typeof periodicTimer.unref === 'function') periodicTimer.unref();
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (periodicTimer !== null) {
      clearInterval(periodicTimer);
      periodicTimer = null;
    }
    // Best-effort drain sample so the last datapoint reflects scratch
    // state at shutdown. Emitted async — caller does NOT await dispose()
    // (it's a sync teardown contract used by server.ts swap + SIGTERM path).
    if (isS3ProjectStorageLayout(layout) && scratchDiskMetricsEnabled()) {
      void emitPeriodicScratchDiskUsageMarker(layout.scratchDir, 'drain');
    }
  }

  return {
    layout,
    storage,
    beforeChatRun,
    afterChatRun,
    wrapFinish,
    withProjectLock,
    markProjectSyncFailed,
    clearProjectSyncFailed,
    isProjectSyncFailed,
    rememberProjectRemote,
    getProjectRemote,
    forgetProjectRemote,
    dispose,
  };
}
