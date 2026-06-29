import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import { MaterializingProjectStorage } from '../src/storage/materializing-project-storage.js';
import { LocalProjectStorage } from '../src/storage/project-storage.js';
import { createProjectMaterializationRuntime } from '../src/storage/project-materialization-runtime.js';
import { resolveProjectStorageLayout } from '../src/storage/project-storage-layout.js';
import {
  createByokProxyMaterializationHooks,
  readProxyBodyProjectId,
} from '../src/storage/byok-proxy-materialization.js';

function mockReq(): Request {
  return { headers: {} } as unknown as Request;
}

function mockRes(): { res: Response; emitFinish: () => void; emitClose: () => void } {
  const listeners: Record<string, Array<() => void>> = {};
  const res = {
    on(event: string, fn: () => void) {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(fn);
      return this;
    },
    once(event: string, fn: () => void) {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(fn);
      return this;
    },
  } as unknown as Response;
  return {
    res,
    emitFinish: () => {
      for (const fn of listeners.finish ?? []) fn();
    },
    emitClose: () => {
      for (const fn of listeners.close ?? []) fn();
    },
  };
}

describe('byok-proxy-materialization', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.OD_BYOK_PROXY_MATERIALIZATION;
  });

  it('readProxyBodyProjectId extracts string projectId', () => {
    expect(readProxyBodyProjectId({ projectId: 'p1' })).toBe('p1');
    expect(readProxyBodyProjectId({ projectId: 1 })).toBeUndefined();
    expect(readProxyBodyProjectId(null)).toBeUndefined();
  });

  it('returns null outside s3 layout', () => {
    const layout = resolveProjectStorageLayout({}, '/data');
    const runtime = createProjectMaterializationRuntime(layout, null);
    expect(createByokProxyMaterializationHooks(runtime)).toBeNull();
  });

  it('returns null when OD_BYOK_PROXY_MATERIALIZATION=0', () => {
    vi.stubEnv('OD_BYOK_PROXY_MATERIALIZATION', '0');
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    expect(createByokProxyMaterializationHooks(runtime)).toBeNull();
  });

  it('attach runs beforeChatRun then afterChatRun once on response finish', async () => {
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const beforeSpy = vi.spyOn(runtime, 'beforeChatRun').mockResolvedValue();
    const afterSpy = vi.spyOn(runtime, 'afterChatRun').mockResolvedValue();
    const hooks = createByokProxyMaterializationHooks(runtime);
    expect(hooks).not.toBeNull();

    const req = mockReq();
    const { res, emitFinish, emitClose } = mockRes();

    await hooks!.attachByokProxyStreamMaterialization(req, res, 'p-byok');
    expect(beforeSpy).toHaveBeenCalledTimes(1);
    expect(beforeSpy.mock.calls[0]?.[0]?.projectId).toBe('p-byok');
    expect(afterSpy).not.toHaveBeenCalled();

    emitFinish();
    emitClose();
    await new Promise((r) => setImmediate(r));

    expect(afterSpy).toHaveBeenCalledTimes(1);
    expect(afterSpy.mock.calls[0]?.[0]?.projectId).toBe('p-byok');
  });

  it('skips attach when projectId is missing or unsafe', async () => {
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const beforeSpy = vi.spyOn(runtime, 'beforeChatRun').mockResolvedValue();
    const hooks = createByokProxyMaterializationHooks(runtime);

    const req = mockReq();
    const { res } = mockRes();

    await hooks!.attachByokProxyStreamMaterialization(req, res, undefined);
    await hooks!.attachByokProxyStreamMaterialization(req, res, '../escape');
    expect(beforeSpy).not.toHaveBeenCalled();
  });

  it('continues without finish hook when begin throws after rollback (legacy mode)', async () => {
    vi.stubEnv('OD_BYOK_PROXY_FAIL_ON_BEGIN', '0');
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const beforeSpy = vi.spyOn(runtime, 'beforeChatRun').mockRejectedValue(new Error('sync-down failed'));
    const afterSpy = vi.spyOn(runtime, 'afterChatRun').mockResolvedValue();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hooks = createByokProxyMaterializationHooks(runtime);

    const req = mockReq();
    const { res, emitFinish } = mockRes();

    const result = await hooks!.attachByokProxyStreamMaterialization(req, res, 'p-byok');
    expect(result).toEqual({ ok: true });
    emitFinish();
    await new Promise((r) => setImmediate(r));

    // Rollback during begin — not the response finish hook.
    expect(beforeSpy).toHaveBeenCalledTimes(1);
    expect(afterSpy).toHaveBeenCalledTimes(1);
    expect(afterSpy.mock.calls[0]?.[0]?.projectId).toBe('p-byok');
    warnSpy.mockRestore();
  });

  it('fail-fast returns ok:false and writes 502 when begin throws (default)', async () => {
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage('/tmp/scratch'),
      new LocalProjectStorage('/tmp/remote'),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    vi.spyOn(runtime, 'beforeChatRun').mockRejectedValue(new Error('sync-down failed'));
    const afterSpy = vi.spyOn(runtime, 'afterChatRun').mockResolvedValue();
    const hooks = createByokProxyMaterializationHooks(runtime);

    const req = mockReq();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const res = {
      headersSent: false,
      status,
      json,
      once: vi.fn(),
    } as unknown as Response;

    const result = await hooks!.attachByokProxyStreamMaterialization(req, res, 'p-byok');
    expect(result).toEqual({ ok: false });
    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalled();
    expect(afterSpy).toHaveBeenCalledTimes(1);
  });
});
