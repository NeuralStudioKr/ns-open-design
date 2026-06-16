import type { Request, RequestHandler } from 'express';

import { readTeamverIdentityFromRequest } from '../teamver-project-access.js';
import type { ProjectMaterializationRuntime } from './project-materialization-runtime.js';
import { resolveTeamverTenantRemoteStorage } from './teamver-project-storage-meta.js';
import { isS3ProjectStorageLayout } from './project-storage-layout.js';

export type ProjectStorageAccessHooks = {
  ensureMaterialized: (req: Request, projectId: string) => Promise<void>;
  persistAfterMutation: (req: Request, projectId: string) => Promise<void>;
};

function lazySyncTtlMs(): number {
  const parsed = Number(process.env.OD_PROJECT_LAZY_SYNC_TTL_MS ?? '');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60_000;
}

function isProjectMaterializationPath(pathname: string): boolean {
  if (/^\/api\/projects\/[^/]+\/(files|folders|search|preview-url|upload)(\/|$)/.test(pathname)) {
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
  if (!runtime?.storage || !isS3ProjectStorageLayout(runtime.layout)) return null;

  const storage = runtime.storage;
  const lastSyncAt = new Map<string, number>();
  const inflight = new Map<string, Promise<void>>();

  async function resolveRemote(req: Request, projectId: string) {
    const identity = readTeamverIdentityFromRequest(req);
    const resolved = await resolveTeamverTenantRemoteStorage(
      projectId,
      identity,
      (objectPrefix) => storage.remoteForTenantPrefix(objectPrefix),
      () => storage.flatRemote(),
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
      const remote = await resolveRemote(req, trimmedId);
      const result = await storage.syncDown(trimmedId, remote);
      lastSyncAt.set(trimmedId, Date.now());
      console.info(
        `[project-materialization] lazy sync-down ${trimmedId}: ${result.files} file(s)`,
      );
    })();

    inflight.set(trimmedId, task);
    try {
      await task;
    } finally {
      inflight.delete(trimmedId);
    }
  }

  async function persistAfterMutation(req: Request, projectId: string): Promise<void> {
    const trimmedId = projectId.trim();
    if (!trimmedId) return;

    lastSyncAt.delete(trimmedId);
    try {
      const remote = await resolveRemote(req, trimmedId);
      // runStart=0 → upload all scratch files (non-run API writes).
      const result = await storage.syncUp(trimmedId, remote, 0);
      console.info(
        `[project-materialization] lazy sync-up ${trimmedId}: uploaded=${result.uploaded} skipped=${result.skipped} failed=${result.failed}`,
      );
      if (result.failed > 0 && process.env.OD_S3_SYNC_UP_METRICS === '1') {
        console.info(JSON.stringify({
          metric: 'od_s3_sync_up_failed',
          projectId: trimmedId,
          failed: result.failed,
          uploaded: result.uploaded,
        }));
      }
    } catch (err) {
      console.warn(
        `[project-materialization] lazy sync-up failed for ${trimmedId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { ensureMaterialized, persistAfterMutation };
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
      res.on('finish', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return;
        void hooks.persistAfterMutation(req, projectId);
      });
    }

    return next();
  };
}
