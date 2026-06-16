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
};

export function createProjectMaterializationRuntime(
  layout: ProjectStorageLayout,
  storage: MaterializingProjectStorage | null,
): ProjectMaterializationRuntime {
  const activeProjectRuns = new Map<string, number>();
  const projectLocks = new Map<string, Promise<void>>();

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
      run.projectMaterializationStartedAt = Date.now();
      return;
    }

    activeProjectRuns.set(projectId, 1);
    const remote = await resolveRunRemote(run, projectId);
    await withProjectLock(projectId, async () => {
      const result = await storage.syncDown(projectId, remote);
      const prefixNote = run.teamverS3Prefix ? ` prefix=${run.teamverS3Prefix}` : '';
      console.info(
        `[project-materialization] sync-down ${projectId}: ${result.files} file(s)${prefixNote}`,
      );
    });
    run.projectMaterializationStartedAt = Date.now();
  }

  async function afterChatRun(run: RunLike): Promise<void> {
    if (!storage || !isS3ProjectStorageLayout(layout)) return;
    const projectId = typeof run.projectId === 'string' ? run.projectId.trim() : '';
    if (!projectId) return;

    const startedAt = run.projectMaterializationStartedAt ?? Date.now();
    const active = activeProjectRuns.get(projectId) ?? 0;
    if (active <= 1) {
      activeProjectRuns.delete(projectId);
      const remote = run.teamverRemote ?? storage.flatRemote();
      await withProjectLock(projectId, async () => {
        try {
          const result = await storage.syncUp(projectId, remote, startedAt);
          console.info(
            `[project-materialization] sync-up ${projectId}: uploaded=${result.uploaded} skipped=${result.skipped} failed=${result.failed}`,
          );
          if (process.env.OD_SCRATCH_EVICT_AFTER_RUN === '1') {
            await storage.evictScratchProject(projectId);
          }
        } catch (err) {
          console.warn(
            `[project-materialization] sync-up failed for ${projectId}:`,
            err instanceof Error ? err.message : err,
          );
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

  return {
    layout,
    storage,
    beforeChatRun,
    wrapFinish,
  };
}
