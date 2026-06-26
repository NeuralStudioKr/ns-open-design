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

export type ProjectMaterializationRuntime = {
  layout: ProjectStorageLayout;
  storage: MaterializingProjectStorage | null;
  beforeChatRun: (run: RunLike) => Promise<void>;
  wrapFinish: <T extends (...args: unknown[]) => unknown>(finish: T) => T;
  withProjectLock: <T>(projectId: string, fn: () => Promise<T>) => Promise<T>;
  markProjectSyncFailed: (projectId: string) => void;
  clearProjectSyncFailed: (projectId: string) => void;
  isProjectSyncFailed: (projectId: string) => boolean;
  /** Stops the optional scratch disk-usage interval timer (no-op when disabled). */
  dispose: () => void;
};

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
  /** Projects whose last sync-up reported failures — idle evict must retain scratch. */
  const projectSyncFailed = new Set<string>();

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
      }
      return;
    }

    activeProjectRuns.set(projectId, 1);
    const remote = await resolveRunRemote(run, projectId);
    projectTenantRemote.set(projectId, remote);
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
          const result = await storage.syncUp(projectId, remote, startedAt);
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
    wrapFinish,
    withProjectLock,
    markProjectSyncFailed,
    clearProjectSyncFailed,
    isProjectSyncFailed,
    dispose,
  };
}
