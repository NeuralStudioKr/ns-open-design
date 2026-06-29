import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

import type { Response } from 'express';

import {
  createLazyProjectMaterializationMiddleware,
  createProjectStorageAccessHooks,
  scheduleProjectStoragePersistAfterResponse,
} from '../src/storage/lazy-project-materialization.js';
import { LocalProjectStorage } from '../src/storage/project-storage.js';
import { MaterializingProjectStorage } from '../src/storage/materializing-project-storage.js';
import { createProjectMaterializationRuntime } from '../src/storage/project-materialization-runtime.js';
import { resolveProjectStorageLayout } from '../src/storage/project-storage-layout.js';

void createLazyProjectMaterializationMiddleware;

function mockReq(method: string, urlPath: string, projectId: string): Request {
  return {
    method,
    path: urlPath,
    params: { id: projectId },
    headers: {},
  } as unknown as Request;
}

function mockRes(statusCode = 200): { res: Response; emitFinish: () => void } {
  const listeners: Array<() => void> = [];
  const res = {
    statusCode,
    on(event: string, fn: () => void) {
      if (event === 'finish') listeners.push(fn);
      return this;
    },
  } as unknown as Response;
  return {
    res,
    emitFinish: () => {
      for (const fn of listeners) fn();
    },
  };
}

describe('project materialization sticky remote cache (BYOK safety net)', () => {
  let scratchRoot: string;
  let remoteRoot: string;

  beforeEach(async () => {
    scratchRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-sticky-scratch-'));
    remoteRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-sticky-remote-'));
  });

  afterEach(async () => {
    await fs.rm(scratchRoot, { recursive: true, force: true });
    await fs.rm(remoteRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
    delete process.env.OD_PROJECT_LAZY_SYNC_TTL_MS;
  });

  it('lazy materialization memoizes the tenant remote on the runtime', async () => {
    process.env.OD_PROJECT_LAZY_SYNC_TTL_MS = '60000';
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const hooks = createProjectStorageAccessHooks(runtime);
    expect(hooks).not.toBeNull();

    vi.spyOn(storage, 'syncDown').mockResolvedValue({ files: 0 });

    expect(runtime.getProjectRemote('p-byok')).toBeUndefined();

    await hooks!.ensureMaterialized(
      mockReq('GET', '/api/projects/p-byok/files', 'p-byok'),
      'p-byok',
    );

    expect(runtime.getProjectRemote('p-byok')).toBeDefined();
  });

  it('rememberProjectRemote survives runtime usage and is retrievable by idle sweep', () => {
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const remote = storage.flatRemote();

    runtime.rememberProjectRemote('p-byok', remote);
    expect(runtime.getProjectRemote('p-byok')).toBe(remote);

    runtime.rememberProjectRemote('   ', remote);
    expect(runtime.getProjectRemote('')).toBeUndefined();

    runtime.forgetProjectRemote('p-byok');
    expect(runtime.getProjectRemote('p-byok')).toBeUndefined();
    // forgetting an unknown / empty id is a no-op (does not throw).
    runtime.forgetProjectRemote('   ');
    runtime.forgetProjectRemote('does-not-exist');
  });

  it('onProjectRemoved drops the sticky remote cache for the deleted project', async () => {
    process.env.OD_PROJECT_LAZY_SYNC_TTL_MS = '60000';
    process.env.OD_S3_PURGE_ON_DELETE = '0';
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const hooks = createProjectStorageAccessHooks(runtime);

    vi.spyOn(storage, 'syncDown').mockResolvedValue({ files: 0 });
    vi.spyOn(storage, 'evictScratchProject').mockResolvedValue();

    try {
      await hooks!.ensureMaterialized(
        mockReq('GET', '/api/projects/p-byok/files', 'p-byok'),
        'p-byok',
      );
      expect(runtime.getProjectRemote('p-byok')).toBeDefined();

      await hooks!.onProjectRemoved(
        mockReq('DELETE', '/api/projects/p-byok', 'p-byok'),
        'p-byok',
      );
      expect(runtime.getProjectRemote('p-byok')).toBeUndefined();
    } finally {
      delete process.env.OD_S3_PURGE_ON_DELETE;
    }
  });

  it('scheduleProjectStoragePersistAfterResponse fires persistAfterMutation on 2xx finish', async () => {
    const persist = vi.fn(
      async (_req: Request, _projectId: string, _options?: { strict?: boolean }) => {},
    );
    const hooks = {
      ensureMaterialized: async () => {},
      persistAfterMutation: persist,
      onProjectRemoved: async () => {},
    };
    const req = mockReq('PUT', '/api/projects/p-byok/conversations/c1/messages/m1', 'p-byok');
    const { res, emitFinish } = mockRes(200);

    scheduleProjectStoragePersistAfterResponse(hooks, req, res, 'p-byok');
    emitFinish();
    await new Promise((r) => setImmediate(r));

    expect(persist).toHaveBeenCalledTimes(1);
    const call = persist.mock.calls[0];
    expect(call?.[1]).toBe('p-byok');
  });

  it('scheduleProjectStoragePersistAfterResponse skips persistAfterMutation on error status', async () => {
    const persist = vi.fn(
      async (_req: Request, _projectId: string, _options?: { strict?: boolean }) => {},
    );
    const hooks = {
      ensureMaterialized: async () => {},
      persistAfterMutation: persist,
      onProjectRemoved: async () => {},
    };
    const req = mockReq('PUT', '/api/projects/p-byok/conversations/c1/messages/m1', 'p-byok');
    const { res, emitFinish } = mockRes(500);

    scheduleProjectStoragePersistAfterResponse(hooks, req, res, 'p-byok');
    emitFinish();
    await new Promise((r) => setImmediate(r));

    expect(persist).not.toHaveBeenCalled();
  });

  it('runtime idle sweep flushes pending scratch via the sticky remote before evicting', async () => {
    vi.stubEnv('OD_SCRATCH_EVICT_AFTER_RUN', '1');
    vi.stubEnv('OD_SCRATCH_EVICT_IDLE', '1');
    vi.stubEnv('OD_SCRATCH_DISK_METRIC_INTERVAL_MS', '40');
    vi.stubEnv('OD_SCRATCH_EVICT_IDLE_AFTER_MS', '20');
    process.env.OD_PROJECT_LAZY_SYNC_TTL_MS = '60000';

    const projectsDir = path.join(scratchRoot, 'projects');
    const projectScratch = path.join(projectsDir, 'p-byok');
    await fs.mkdir(projectScratch, { recursive: true });
    await fs.writeFile(path.join(projectScratch, 'artifact.html'), '<html></html>', 'utf8');
    await fs.utimes(projectScratch, new Date(Date.now() - 10_000), new Date(Date.now() - 10_000));

    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(projectsDir),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = {
      mode: 's3' as const,
      scratchDir: scratchRoot,
      projectsDir,
    };
    const runtime = createProjectMaterializationRuntime(layout, storage);

    const syncUpSpy = vi
      .spyOn(storage, 'syncUp')
      .mockResolvedValue({ uploaded: 1, skipped: 0, deleted: 0, failed: 0 });
    const evictSpy = vi.spyOn(storage, 'evictScratchProject').mockResolvedValue();

    // Sweep #1: no sticky remote → defers eviction, retains scratch.
    await new Promise((r) => setTimeout(r, 80));
    expect(evictSpy).not.toHaveBeenCalled();
    expect(syncUpSpy).not.toHaveBeenCalled();

    // Mimic a request having resolved + cached the tenant remote.
    runtime.rememberProjectRemote('p-byok', storage.flatRemote());

    // Sweep #2: sticky remote available → syncUp succeeds → evict proceeds.
    await new Promise((r) => setTimeout(r, 80));
    expect(syncUpSpy).toHaveBeenCalled();
    expect(evictSpy).toHaveBeenCalledWith('p-byok');

    runtime.dispose();
  });
});
