import type { Request, RequestHandler, Response } from 'express';

import { readTeamverIdentityFromRequest, readTeamverS3PrefixFromRequest, clearTeamverProjectAccessCache, isTeamverProjectCollectionRouteSlug, isTrustedBackendCaller } from '../teamver-project-access.js';
import type { ProjectMaterializationRuntime } from './project-materialization-runtime.js';
import type { MaterializingProjectStorage } from './materializing-project-storage.js';
import { resolveTeamverTenantRemoteStorage, TeamverTenantStorageResolutionError } from './teamver-project-storage-meta.js';
import { isS3ProjectStorageLayout } from './project-storage-layout.js';
import { TenantScopedProjectStorage } from './tenant-scoped-project-storage.js';

export type ProjectStorageAccessHooks = {
  ensureMaterialized: (req: Request, projectId: string) => Promise<void>;
  persistAfterMutation: (
    req: Request,
    projectId: string,
    options?: { strict?: boolean },
  ) => Promise<void>;
  onProjectRemoved: (req: Request, projectId: string) => Promise<void>;
};

function s3RemotePurgeOnDeleteEnabled(): boolean {
  const raw = (process.env.OD_S3_PURGE_ON_DELETE ?? '').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  // Default on in S3 mode — registry delete must not leave tenant SSOT orphaned.
  return true;
}

function lazySyncTtlMs(): number {
  const parsed = Number(process.env.OD_PROJECT_LAZY_SYNC_TTL_MS ?? '');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60_000;
}

function strictPersistRetryAttempts(): number {
  const parsed = Number(process.env.OD_S3_STRICT_PERSIST_RETRIES ?? '');
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 3;
}

function backgroundPersistRetryAttempts(): number {
  const parsed = Number(process.env.OD_S3_BACKGROUND_PERSIST_RETRIES ?? '');
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 2;
}

function strictPersistRetryMs(): number {
  const parsed = Number(process.env.OD_S3_STRICT_PERSIST_RETRY_MS ?? '');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 300;
}

function backgroundPersistRetryMs(): number {
  const parsed = Number(process.env.OD_S3_BACKGROUND_PERSIST_RETRY_MS ?? '');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
}

function materializeRetryAttempts(): number {
  const parsed = Number(process.env.OD_S3_MATERIALIZE_RETRIES ?? '');
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 3;
}

function materializeRetryMs(): number {
  const parsed = Number(process.env.OD_S3_MATERIALIZE_RETRY_MS ?? '');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 250;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProjectMaterializationPath(pathname: string): boolean {
  // Middleware is mounted at /api/projects/:id — req.path is relative (/files, /raw/…).
  const core = String(pathname ?? '');
  if (/^\/(files|folders|search|preview-url|upload|media|finalize|deploy|design-system-package-audit)(\/|$)/.test(core)) {
    return true;
  }
  if (/^\/raw(\/|$)/.test(core)) {
    return true;
  }
  if (/^\/plugins\/(install-folder|publish-github|contribute-open-design|share-tasks)(\/|$)/.test(core)) {
    return true;
  }
  if (/^\/export(\/|$)/.test(core)) {
    return true;
  }
  if (/^\/archive(\/|$)/.test(core)) {
    return true;
  }
  // Unmounted absolute paths (unit tests, direct handlers).
  if (/^\/api\/projects\/[^/]+\/(files|folders|search|preview-url|upload|media|finalize|deploy|design-system-package-audit)(\/|$)/.test(core)) {
    return true;
  }
  if (/^\/api\/projects\/[^/]+\/raw(\/|$)/.test(core)) {
    return true;
  }
  if (/^\/api\/projects\/[^/]+\/plugins\/(install-folder|publish-github|contribute-open-design|share-tasks)(\/|$)/.test(core)) {
    return true;
  }
  if (/^\/api\/projects\/[^/]+\/export(\/|$)/.test(core)) {
    return true;
  }
  if (/^\/api\/projects\/[^/]+\/archive(\/|$)/.test(core)) {
    return true;
  }
  return false;
}

function isMutatingMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

export function createProjectStorageAccessHooks(
  runtime: ProjectMaterializationRuntime | null,
): ProjectStorageAccessHooks | null {
  if (runtime === null || !isS3ProjectStorageLayout(runtime.layout)) {
    return null;
  }

  const materializationRuntime = runtime;
  const projectStorage = materializationRuntime.storage;
  if (projectStorage === null) {
    return null;
  }
  const storage: MaterializingProjectStorage = projectStorage;
  const lastSyncAt = new Map<string, number>();
  const inflight = new Map<string, Promise<void>>();

  async function resolveRemote(req: Request, projectId: string) {
    const identity = readTeamverIdentityFromRequest(req);
    const s3PrefixOverride = readTeamverS3PrefixFromRequest(req);
    const trustOverride = isTrustedBackendCaller(req);
    try {
      const resolved = await resolveTeamverTenantRemoteStorage(
        projectId,
        identity,
        (objectPrefix) => storage.remoteForTenantPrefix(objectPrefix),
        () => storage.flatRemote(),
        s3PrefixOverride,
        { trustOverride },
      );
      // Memoize the deterministic tenant remote so the idle-evict sweep can
      // flush scratch → S3 without needing a request context (BYOK chats only
      // hit lazy paths — they never carry a managed run that would otherwise
      // populate the cache via beforeChatRun).
      materializationRuntime.rememberProjectRemote(projectId, resolved.remote);
      return resolved.remote;
    } catch (err) {
      if (
        err instanceof TeamverTenantStorageResolutionError
        && err.message === 'teamver_project_s3_prefix_required'
      ) {
        clearTeamverProjectAccessCache(projectId);
      }
      throw err;
    }
  }

  async function maybeSyncBootOrphan(req: Request, projectId: string): Promise<boolean> {
    if (!materializationRuntime.consumeBootOrphanProject(projectId)) return false;
    console.info(
      JSON.stringify({
        metric: 'od_scratch_orphan_boot_sync_up',
        projectId,
      }),
    );
    const remote = await resolveRemote(req, projectId);
    const result = await storage.syncUp(projectId, remote, 0);
    console.info(
      `[project-materialization] boot orphan sync-up ${projectId}: uploaded=${result.uploaded} skipped=${result.skipped} deleted=${result.deleted} failed=${result.failed}`,
    );
    if (result.failed > 0) {
      materializationRuntime.markProjectSyncFailed(projectId);
      throw new Error(`project_storage_boot_orphan_sync_failed:${result.failed}`);
    }
    materializationRuntime.clearProjectSyncFailed(projectId);
    return true;
  }

  async function ensureMaterialized(req: Request, projectId: string): Promise<void> {
    const trimmedId = projectId.trim();
    if (!trimmedId) return;

    // Active-run guard: a managed `POST /api/runs` or a BYOK proxy stream
    // currently owns this project's scratch — its agent is mid-flight writing
    // files. Re-running sync-down here would clobber those pending writes
    // with the older S3 snapshot, and a run-end sync-up would then upload the
    // partial overwrite. Defer entirely; the run-end / proxy-end hook will
    // sync-up first and the next lazy GET past the active window will refresh.
    if (materializationRuntime.getActiveRunCount(trimmedId) > 0) {
      console.info(
        JSON.stringify({
          metric: 'od_s3_lazy_sync_down_skipped_active_run',
          projectId: trimmedId,
          activeRuns: materializationRuntime.getActiveRunCount(trimmedId),
        }),
      );
      return;
    }

    const ttl = lazySyncTtlMs();
    const now = Date.now();
    const previous = lastSyncAt.get(trimmedId) ?? 0;
    const forceRefresh = materializationRuntime.isProjectSyncFailed(trimmedId)
      || materializationRuntime.hasBootOrphanProject(trimmedId);
    if (!forceRefresh && ttl > 0 && now - previous < ttl) return;

    const pending = inflight.get(trimmedId);
    if (pending) {
      await pending;
      return;
    }

    const task = (async () => {
      const maxAttempts = materializeRetryAttempts();
      let lastErr: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await materializationRuntime.withProjectLock(trimmedId, async () => {
            const remote = await resolveRemote(req, trimmedId);
            const syncingFailed = materializationRuntime.isProjectSyncFailed(trimmedId);
            const down = await storage.syncDown(trimmedId, remote);
            lastSyncAt.set(trimmedId, Date.now());
            console.info(
              `[project-materialization] lazy sync-down ${trimmedId}: ${down.files} file(s)`,
            );
            if (syncingFailed) {
              const heal = await storage.syncUp(trimmedId, remote, 0);
              console.info(
                `[project-materialization] lazy self-heal sync-up ${trimmedId}: uploaded=${heal.uploaded} skipped=${heal.skipped} deleted=${heal.deleted} failed=${heal.failed}`,
              );
              if (heal.failed > 0) {
                throw new Error(`project_storage_self_heal_failed:${heal.failed}`);
              }
              materializationRuntime.clearProjectSyncFailed(trimmedId);
            }
            await maybeSyncBootOrphan(req, trimmedId);
          });
          return;
        } catch (err) {
          lastErr = err;
          if (attempt >= maxAttempts) break;
          console.warn(
            `[project-materialization] retrying lazy sync-down for ${trimmedId} (${attempt}/${maxAttempts}) after failure:`,
            err instanceof Error ? err.message : err,
          );
          if (process.env.OD_S3_SYNC_UP_METRICS === '1') {
            console.info(JSON.stringify({
              metric: 'od_s3_lazy_sync_down_retry',
              projectId: trimmedId,
              attempt,
              maxAttempts,
            }));
          }
          await sleep(materializeRetryMs() * attempt);
        }
      }
      throw lastErr;
    })();

    inflight.set(trimmedId, task);
    try {
      await task;
    } finally {
      inflight.delete(trimmedId);
    }
  }

  async function persistAfterMutation(
    req: Request,
    projectId: string,
    options?: { strict?: boolean },
  ): Promise<void> {
    const trimmedId = projectId.trim();
    if (!trimmedId) return;

    lastSyncAt.delete(trimmedId);

    // Active-run guard: a managed run or BYOK proxy stream will sync-up the
    // canonical scratch state on its run-end / stream-end hook. Issuing a
    // racing sync-up here can PUT a partially-written intermediate state to
    // S3 before the agent finishes, and confuses the run-touched mtime
    // floor logic. Defer to the run-end hook — it always uploads a
    // strictly newer (or equal) generation, with the floor applied. Strict
    // callers (immediate publish/deploy) still proceed: they hold a higher
    // contract than the run-end uploader.
    if (
      !options?.strict
      && materializationRuntime.getActiveRunCount(trimmedId) > 0
    ) {
      console.info(
        JSON.stringify({
          metric: 'od_s3_lazy_sync_up_skipped_active_run',
          projectId: trimmedId,
          activeRuns: materializationRuntime.getActiveRunCount(trimmedId),
        }),
      );
      return;
    }

    const runPersist = async (): Promise<boolean> => {
      try {
        if (await maybeSyncBootOrphan(req, trimmedId)) {
          return true;
        }
        const remote = await resolveRemote(req, trimmedId);
        // runStart=0 → upload all scratch files (non-run API writes).
        const result = await storage.syncUp(trimmedId, remote, 0);
        console.info(
          `[project-materialization] lazy sync-up ${trimmedId}: uploaded=${result.uploaded} skipped=${result.skipped} deleted=${result.deleted} failed=${result.failed}`,
        );
        if (result.failed > 0 && process.env.OD_S3_SYNC_UP_METRICS === '1') {
          console.info(JSON.stringify({
            metric: 'od_s3_sync_up_failed',
            projectId: trimmedId,
            failed: result.failed,
            uploaded: result.uploaded,
          }));
        }
        if (result.failed > 0) {
          materializationRuntime.markProjectSyncFailed(trimmedId);
          if (options?.strict) {
            throw new Error(`project_storage_sync_failed:${result.failed}`);
          }
          return false;
        } else {
          materializationRuntime.clearProjectSyncFailed(trimmedId);
        }
        return true;
      } catch (err) {
        materializationRuntime.markProjectSyncFailed(trimmedId);
        console.warn(
          `[project-materialization] lazy sync-up failed for ${trimmedId}:`,
          err instanceof Error ? err.message : err,
        );
        if (options?.strict) throw err;
        return false;
      }
    };

    const maxAttempts = options?.strict ? strictPersistRetryAttempts() : backgroundPersistRetryAttempts();
    const retryMs = options?.strict ? strictPersistRetryMs() : backgroundPersistRetryMs();
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const persisted = await materializationRuntime.withProjectLock(trimmedId, runPersist);
        if (persisted) return;
        if (attempt >= maxAttempts) return;
        console.warn(
          `[project-materialization] retrying background sync-up for ${trimmedId} (${attempt}/${maxAttempts}) after partial failure`,
        );
        if (process.env.OD_S3_SYNC_UP_METRICS === '1') {
          console.info(JSON.stringify({
            metric: 'od_s3_background_persist_retry',
            projectId: trimmedId,
            attempt,
            maxAttempts,
          }));
        }
        await sleep(retryMs * attempt);
      } catch (err) {
        lastErr = err;
        if (!options?.strict || attempt >= maxAttempts) break;
        console.warn(
          `[project-materialization] retrying strict sync-up for ${trimmedId} (${attempt}/${maxAttempts}) after failure:`,
          err instanceof Error ? err.message : err,
        );
        if (process.env.OD_S3_SYNC_UP_METRICS === '1') {
          console.info(JSON.stringify({
            metric: 'od_s3_strict_persist_retry',
            projectId: trimmedId,
            attempt,
            maxAttempts,
          }));
        }
        await sleep(retryMs * attempt);
      }
    }
    if (options?.strict) throw lastErr;
  }

  async function onProjectRemoved(req: Request, projectId: string): Promise<void> {
    const trimmedId = projectId.trim();
    if (!trimmedId) return;
    lastSyncAt.delete(trimmedId);
    inflight.delete(trimmedId);
    // Sticky remote cache must drop deleted projects so the idle sweep does
    // not later attempt sync-up against a purged S3 prefix (and so the cache
    // does not leak entries forever in long-running daemons).
    materializationRuntime.forgetProjectRemote(trimmedId);

    if (s3RemotePurgeOnDeleteEnabled()) {
      try {
        const remote = await resolveRemote(req, trimmedId);
        const result = await storage.purgeRemoteProject(remote);
        if (result.deleted > 0 || result.failed > 0) {
          const s3Prefix =
            remote instanceof TenantScopedProjectStorage ? remote.objectPrefix : undefined;
          console.info(
            JSON.stringify({
              metric: 'od_s3_remote_purged',
              projectId: trimmedId,
              deleted: result.deleted,
              failed: result.failed,
              ...(s3Prefix ? { s3Prefix } : {}),
            }),
          );
        }
        if (result.failed > 0) {
          console.warn(
            `[project-materialization] remote purge partial failure for ${trimmedId}: deleted=${result.deleted} failed=${result.failed}`,
          );
        }
      } catch (err) {
        console.warn(
          `[project-materialization] remote purge failed for ${trimmedId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    try {
      await storage.evictScratchProject(trimmedId);
    } catch (err) {
      console.warn(
        `[project-materialization] scratch evict failed for ${trimmedId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { ensureMaterialized, persistAfterMutation, onProjectRemoved };
}

/** Scratch project mutations outside file-route middleware (e.g. POST /api/projects). */
export function scheduleProjectStoragePersistAfterResponse(
  hooks: ProjectStorageAccessHooks | null | undefined,
  req: Request,
  res: Response,
  projectId: string,
): void {
  if (!hooks) return;
  const trimmedId = projectId.trim();
  if (!trimmedId) return;
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    void hooks.persistAfterMutation(req, trimmedId);
  });
}

export function createLazyProjectMaterializationMiddleware(
  hooks: ProjectStorageAccessHooks | null,
  sendApiError: (...args: unknown[]) => unknown,
): RequestHandler {
  return async (req, res, next) => {
    if (!hooks || !isProjectMaterializationPath(req.path)) return next();

    const projectId = req.params.id;
    if (typeof projectId !== 'string' || !projectId.trim()) return next();
    if (isTeamverProjectCollectionRouteSlug(projectId)) return next();

    if (req.method === 'GET' || req.method === 'HEAD') {
      try {
        await hooks.ensureMaterialized(req, projectId);
      } catch (err) {
        return sendApiError(
          res,
          502,
          'UPSTREAM_UNAVAILABLE',
          err instanceof Error ? err.message : 'project storage sync failed',
        );
      }
      return next();
    }

    if (isMutatingMethod(req.method)) {
      try {
        await hooks.ensureMaterialized(req, projectId);
      } catch (err) {
        return sendApiError(
          res,
          502,
          'UPSTREAM_UNAVAILABLE',
          err instanceof Error ? err.message : 'project storage sync failed',
        );
      }
      res.on('finish', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return;
        void hooks.persistAfterMutation(req, projectId);
      });
    }

    return next();
  };
}
