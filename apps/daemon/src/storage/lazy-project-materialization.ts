import type { Request, RequestHandler, Response } from 'express';

import { readTeamverIdentityFromRequest, readTeamverS3PrefixFromRequest } from '../teamver-project-access.js';
import type { ProjectMaterializationRuntime } from './project-materialization-runtime.js';
import type { MaterializingProjectStorage } from './materializing-project-storage.js';
import { resolveTeamverTenantRemoteStorage } from './teamver-project-storage-meta.js';
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

function strictPersistRetryMs(): number {
  const parsed = Number(process.env.OD_S3_STRICT_PERSIST_RETRY_MS ?? '');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 300;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProjectMaterializationPath(pathname: string): boolean {
  if (/^\/api\/projects\/[^/]+\/(files|folders|search|preview-url|upload|media|finalize|deploy|design-system-package-audit)(\/|$)/.test(pathname)) {
    return true;
  }
  if (/^\/api\/projects\/[^/]+\/plugins\/(install-folder|publish-github|contribute-open-design|share-tasks)(\/|$)/.test(pathname)) {
    return true;
  }
  // Publish (design-api OdDaemonClient) reads manifest + inline artifacts from S3-backed projects.
  if (/^\/api\/projects\/[^/]+\/export(\/|$)/.test(pathname)) {
    return true;
  }
  if (/^\/api\/projects\/[^/]+\/archive(\/|$)/.test(pathname)) {
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
    const resolved = await resolveTeamverTenantRemoteStorage(
      projectId,
      identity,
      (objectPrefix) => storage.remoteForTenantPrefix(objectPrefix),
      () => storage.flatRemote(),
      s3PrefixOverride,
    );
    return resolved.remote;
  }

  async function ensureMaterialized(req: Request, projectId: string): Promise<void> {
    const trimmedId = projectId.trim();
    if (!trimmedId) return;

    const ttl = lazySyncTtlMs();
    const now = Date.now();
    const previous = lastSyncAt.get(trimmedId) ?? 0;
    if (ttl > 0 && now - previous < ttl) return;

    const pending = inflight.get(trimmedId);
    if (pending) {
      await pending;
      return;
    }

    const task = (async () => {
      await materializationRuntime.withProjectLock(trimmedId, async () => {
        const remote = await resolveRemote(req, trimmedId);
        const result = await storage.syncDown(trimmedId, remote);
        lastSyncAt.set(trimmedId, Date.now());
        console.info(
          `[project-materialization] lazy sync-down ${trimmedId}: ${result.files} file(s)`,
        );
      });
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
    const runPersist = async (): Promise<void> => {
      try {
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
        } else {
          materializationRuntime.clearProjectSyncFailed(trimmedId);
        }
      } catch (err) {
        materializationRuntime.markProjectSyncFailed(trimmedId);
        console.warn(
          `[project-materialization] lazy sync-up failed for ${trimmedId}:`,
          err instanceof Error ? err.message : err,
        );
        if (options?.strict) throw err;
      }
    };

    const maxAttempts = options?.strict ? strictPersistRetryAttempts() : 1;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await materializationRuntime.withProjectLock(trimmedId, runPersist);
        return;
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
        await sleep(strictPersistRetryMs() * attempt);
      }
    }
    throw lastErr;
  }

  async function onProjectRemoved(req: Request, projectId: string): Promise<void> {
    const trimmedId = projectId.trim();
    if (!trimmedId) return;
    lastSyncAt.delete(trimmedId);
    inflight.delete(trimmedId);

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
