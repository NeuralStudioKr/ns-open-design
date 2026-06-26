import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import {
  createLazyProjectMaterializationMiddleware,
  createProjectStorageAccessHooks,
} from '../src/storage/lazy-project-materialization.js';
import { MaterializingProjectStorage } from '../src/storage/materializing-project-storage.js';
import { LocalProjectStorage } from '../src/storage/project-storage.js';
import { createProjectMaterializationRuntime } from '../src/storage/project-materialization-runtime.js';
import { resolveProjectStorageLayout } from '../src/storage/project-storage-layout.js';

function mockReq(method: string, path: string, projectId = 'p1'): Request {
  return {
    method,
    path,
    params: { id: projectId },
    headers: {},
  } as unknown as Request;
}

function mockRes(): Response {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    statusCode: 200,
    on(event: string, fn: () => void) {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(fn);
      return this;
    },
    emit(event: string) {
      for (const fn of listeners[event] ?? []) fn();
    },
  } as unknown as Response;
}

describe('createProjectStorageAccessHooks', () => {
  it('returns null outside s3 layout', () => {
    const layout = resolveProjectStorageLayout({}, '/data');
    const runtime = createProjectMaterializationRuntime(layout, null);
    expect(createProjectStorageAccessHooks(runtime)).toBeNull();
  });

  it('lazy sync-down copies remote files once per TTL window', async () => {
    const previousTtl = process.env.OD_PROJECT_LAZY_SYNC_TTL_MS;
    process.env.OD_PROJECT_LAZY_SYNC_TTL_MS = '60000';
    const scratchRoot = '/tmp/scratch';
    const remoteRoot = '/tmp/remote';
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const hooks = createProjectStorageAccessHooks(runtime);
    expect(hooks).not.toBeNull();

    const remote = storage.flatRemote();
    const syncDown = vi.spyOn(storage, 'syncDown').mockResolvedValue({ files: 0 });

    try {
      await hooks!.ensureMaterialized(mockReq('GET', '/api/projects/p1/files'), 'p1');
      await hooks!.ensureMaterialized(mockReq('GET', '/api/projects/p1/files'), 'p1');

      expect(syncDown).toHaveBeenCalledTimes(1);
      expect(syncDown.mock.calls[0]?.[1]).toBe(remote);
    } finally {
      if (previousTtl === undefined) delete process.env.OD_PROJECT_LAZY_SYNC_TTL_MS;
      else process.env.OD_PROJECT_LAZY_SYNC_TTL_MS = previousTtl;
    }
  });

  it('marks project sync failed on partial lazy sync-up (non-strict)', async () => {
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const hooks = createProjectStorageAccessHooks(runtime);
    vi.spyOn(storage, 'syncUp').mockResolvedValue({ uploaded: 0, skipped: 0, failed: 2 });

    await hooks!.persistAfterMutation(mockReq('POST', '/api/projects/p1/files'), 'p1');
    expect(runtime.isProjectSyncFailed('p1')).toBe(true);
  });

  it('reports partial sync-up failures only for strict persistence requests', async () => {
    const previousRetries = process.env.OD_S3_STRICT_PERSIST_RETRIES;
    const previousRetryMs = process.env.OD_S3_STRICT_PERSIST_RETRY_MS;
    process.env.OD_S3_STRICT_PERSIST_RETRIES = '1';
    process.env.OD_S3_STRICT_PERSIST_RETRY_MS = '0';
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const hooks = createProjectStorageAccessHooks(
      createProjectMaterializationRuntime(layout, storage),
    );
    vi.spyOn(storage, 'syncUp').mockResolvedValue({ uploaded: 1, skipped: 0, failed: 1 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(
        hooks!.persistAfterMutation(mockReq('POST', '/api/projects/p1/files'), 'p1'),
      ).resolves.toBeUndefined();
      await expect(
        hooks!.persistAfterMutation(
          mockReq('POST', '/api/projects/p1/scratch/sync-up'),
          'p1',
          { strict: true },
        ),
      ).rejects.toThrow('project_storage_sync_failed:1');
    } finally {
      warnSpy.mockRestore();
      if (previousRetries === undefined) delete process.env.OD_S3_STRICT_PERSIST_RETRIES;
      else process.env.OD_S3_STRICT_PERSIST_RETRIES = previousRetries;
      if (previousRetryMs === undefined) delete process.env.OD_S3_STRICT_PERSIST_RETRY_MS;
      else process.env.OD_S3_STRICT_PERSIST_RETRY_MS = previousRetryMs;
    }
  });

  it('retries strict sync-up after transient storage errors', async () => {
    const previousRetries = process.env.OD_S3_STRICT_PERSIST_RETRIES;
    const previousRetryMs = process.env.OD_S3_STRICT_PERSIST_RETRY_MS;
    process.env.OD_S3_STRICT_PERSIST_RETRIES = '2';
    process.env.OD_S3_STRICT_PERSIST_RETRY_MS = '0';
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const hooks = createProjectStorageAccessHooks(runtime);
    const syncUp = vi.spyOn(storage, 'syncUp')
      .mockRejectedValueOnce(new Error('remote list failed'))
      .mockResolvedValueOnce({ uploaded: 1, skipped: 0, deleted: 0, failed: 0 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(
        hooks!.persistAfterMutation(
          mockReq('POST', '/api/projects/p1/scratch/sync-up'),
          'p1',
          { strict: true },
        ),
      ).resolves.toBeUndefined();
      expect(syncUp).toHaveBeenCalledTimes(2);
      expect(runtime.isProjectSyncFailed('p1')).toBe(false);
    } finally {
      warnSpy.mockRestore();
      if (previousRetries === undefined) delete process.env.OD_S3_STRICT_PERSIST_RETRIES;
      else process.env.OD_S3_STRICT_PERSIST_RETRIES = previousRetries;
      if (previousRetryMs === undefined) delete process.env.OD_S3_STRICT_PERSIST_RETRY_MS;
      else process.env.OD_S3_STRICT_PERSIST_RETRY_MS = previousRetryMs;
    }
  });

  it('onProjectRemoved purges remote then evicts scratch (default purge on)', async () => {
    const previousPurge = process.env.OD_S3_PURGE_ON_DELETE;
    delete process.env.OD_S3_PURGE_ON_DELETE;
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const hooks = createProjectStorageAccessHooks(
      createProjectMaterializationRuntime(layout, storage),
    );
    const purge = vi.spyOn(storage, 'purgeRemoteProject').mockResolvedValue({ deleted: 2, failed: 0 });
    const evict = vi.spyOn(storage, 'evictScratchProject').mockResolvedValue(undefined);

    try {
      await hooks!.onProjectRemoved(mockReq('DELETE', '/api/projects/p1'), 'p1');
      expect(purge).toHaveBeenCalledTimes(1);
      expect(evict).toHaveBeenCalledWith('p1');
    } finally {
      if (previousPurge === undefined) delete process.env.OD_S3_PURGE_ON_DELETE;
      else process.env.OD_S3_PURGE_ON_DELETE = previousPurge;
    }
  });

  it('onProjectRemoved skips remote purge when OD_S3_PURGE_ON_DELETE=0', async () => {
    const previousPurge = process.env.OD_S3_PURGE_ON_DELETE;
    process.env.OD_S3_PURGE_ON_DELETE = '0';
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const hooks = createProjectStorageAccessHooks(
      createProjectMaterializationRuntime(layout, storage),
    );
    const purge = vi.spyOn(storage, 'purgeRemoteProject').mockResolvedValue({ deleted: 0, failed: 0 });
    const evict = vi.spyOn(storage, 'evictScratchProject').mockResolvedValue(undefined);

    try {
      await hooks!.onProjectRemoved(mockReq('POST', '/api/projects/p1/scratch/evict'), 'p1');
      expect(purge).not.toHaveBeenCalled();
      expect(evict).toHaveBeenCalledWith('p1');
    } finally {
      if (previousPurge === undefined) delete process.env.OD_S3_PURGE_ON_DELETE;
      else process.env.OD_S3_PURGE_ON_DELETE = previousPurge;
    }
  });
});

describe('createLazyProjectMaterializationMiddleware', () => {
  it('no-ops when hooks are null', async () => {
    const next = vi.fn();
    const middleware = createLazyProjectMaterializationMiddleware(null, vi.fn());
    await middleware(mockReq('GET', '/api/projects/p1/files'), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('runs persistAfterMutation on successful write responses', async () => {
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const hooks = createProjectStorageAccessHooks(
      createProjectMaterializationRuntime(layout, storage),
    );
    const ensure = vi.spyOn(hooks!, 'ensureMaterialized').mockResolvedValue(undefined);
    const persist = vi.spyOn(hooks!, 'persistAfterMutation').mockResolvedValue(undefined);
    const next = vi.fn();
    const res = mockRes();
    const middleware = createLazyProjectMaterializationMiddleware(hooks, vi.fn());

    await middleware(mockReq('POST', '/api/projects/p1/files'), res, next);
    expect(ensure).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    res.emit('finish');
    await new Promise((r) => setTimeout(r, 0));
    expect(persist).toHaveBeenCalled();
  });

  it('runs persistAfterMutation on successful upload responses', async () => {
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const hooks = createProjectStorageAccessHooks(
      createProjectMaterializationRuntime(layout, storage),
    );
    const ensure = vi.spyOn(hooks!, 'ensureMaterialized').mockResolvedValue(undefined);
    const persist = vi.spyOn(hooks!, 'persistAfterMutation').mockResolvedValue(undefined);
    const next = vi.fn();
    const res = mockRes();
    const middleware = createLazyProjectMaterializationMiddleware(hooks, vi.fn());

    await middleware(mockReq('POST', '/api/projects/p1/upload'), res, next);
    expect(ensure).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    res.emit('finish');
    await new Promise((r) => setTimeout(r, 0));
    expect(persist).toHaveBeenCalled();
  });

  it('runs sync-down for export manifest reads (publish path)', async () => {
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const hooks = createProjectStorageAccessHooks(
      createProjectMaterializationRuntime(layout, storage),
    );
    const ensure = vi.spyOn(hooks!, 'ensureMaterialized').mockResolvedValue(undefined);
    const next = vi.fn();
    const middleware = createLazyProjectMaterializationMiddleware(hooks, vi.fn());

    await middleware(
      mockReq('GET', '/api/projects/p1/export/manifest'),
      mockRes(),
      next,
    );

    expect(ensure).toHaveBeenCalledWith(expect.anything(), 'p1');
    expect(next).toHaveBeenCalled();
  });

  it('materializes media/finalize/deploy/design-system file-touching routes', async () => {
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const hooks = createProjectStorageAccessHooks(
      createProjectMaterializationRuntime(layout, storage),
    );
    const ensure = vi.spyOn(hooks!, 'ensureMaterialized').mockResolvedValue(undefined);
    const middleware = createLazyProjectMaterializationMiddleware(hooks, vi.fn());

    for (const path of [
      '/api/projects/p1/media/tasks',
      '/api/projects/p1/design-system-package-audit',
      '/api/projects/p1/finalize/anthropic',
      '/api/projects/p1/deploy/preflight',
    ]) {
      ensure.mockClear();
      const next = vi.fn();
      await middleware(mockReq('GET', path), mockRes(), next);
      expect(ensure).toHaveBeenCalledWith(expect.anything(), 'p1');
      expect(next).toHaveBeenCalled();
    }
  });

  it('schedules persistAfterMutation for plugin install/publish and finalize/deploy POSTs', async () => {
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const hooks = createProjectStorageAccessHooks(
      createProjectMaterializationRuntime(layout, storage),
    );
    const ensure = vi.spyOn(hooks!, 'ensureMaterialized').mockResolvedValue(undefined);
    const persist = vi.spyOn(hooks!, 'persistAfterMutation').mockResolvedValue(undefined);
    const middleware = createLazyProjectMaterializationMiddleware(hooks, vi.fn());

    for (const path of [
      '/api/projects/p1/plugins/install-folder',
      '/api/projects/p1/plugins/publish-github',
      '/api/projects/p1/plugins/share-tasks',
      '/api/projects/p1/finalize/anthropic',
      '/api/projects/p1/deploy',
    ]) {
      persist.mockClear();
      const res = mockRes();
      const next = vi.fn();
      await middleware(mockReq('POST', path), res, next);
      expect(ensure).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      res.emit('finish');
      await new Promise((r) => setTimeout(r, 0));
      expect(persist).toHaveBeenCalled();
    }
  });
});
