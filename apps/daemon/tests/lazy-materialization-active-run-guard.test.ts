import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

import { createProjectStorageAccessHooks } from '../src/storage/lazy-project-materialization.js';
import { LocalProjectStorage } from '../src/storage/project-storage.js';
import { MaterializingProjectStorage } from '../src/storage/materializing-project-storage.js';
import { createProjectMaterializationRuntime } from '../src/storage/project-materialization-runtime.js';
import { resolveProjectStorageLayout } from '../src/storage/project-storage-layout.js';

function mockReq(method: string, urlPath: string, projectId: string): Request {
  return {
    method,
    path: urlPath,
    params: { id: projectId },
    headers: {},
  } as unknown as Request;
}

describe('lazy materialization active-run guard', () => {
  let scratchRoot: string;
  let remoteRoot: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    scratchRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-lazy-guard-scratch-'));
    remoteRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-lazy-guard-remote-'));
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    process.env.OD_PROJECT_LAZY_SYNC_TTL_MS = '0';
  });

  afterEach(async () => {
    infoSpy.mockRestore();
    vi.restoreAllMocks();
    delete process.env.OD_PROJECT_LAZY_SYNC_TTL_MS;
    await fs.rm(scratchRoot, { recursive: true, force: true });
    await fs.rm(remoteRoot, { recursive: true, force: true });
  });

  it('skips lazy sync-down while a materialized run is active', async () => {
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const hooks = createProjectStorageAccessHooks(runtime);
    expect(hooks).not.toBeNull();

    const syncDownSpy = vi.spyOn(storage, 'syncDown').mockResolvedValue({ files: 0 });
    const remote = storage.flatRemote();

    await runtime.beforeChatRun({
      id: 'run-active',
      projectId: 'p-guard',
      teamverRemote: remote,
    });
    expect(runtime.getActiveRunCount('p-guard')).toBe(1);
    syncDownSpy.mockClear();

    await hooks!.ensureMaterialized(
      mockReq('GET', '/api/projects/p-guard/files', 'p-guard'),
      'p-guard',
    );

    expect(syncDownSpy).not.toHaveBeenCalled();

    const skipLines = infoSpy.mock.calls
      .map((call) => String(call[0] ?? ''))
      .filter((line) => line.includes('od_s3_lazy_sync_down_skipped_active_run'));
    expect(skipLines.length).toBe(1);
    const parsed = JSON.parse(skipLines[0]!);
    expect(parsed.projectId).toBe('p-guard');
    expect(parsed.activeRuns).toBe(1);
  });

  it('skips lazy sync-up while a materialized run is active (non-strict)', async () => {
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const hooks = createProjectStorageAccessHooks(runtime);
    expect(hooks).not.toBeNull();

    const syncUpSpy = vi.spyOn(storage, 'syncUp').mockResolvedValue({
      uploaded: 0,
      skipped: 0,
      failed: 0,
      deleted: 0,
    });
    const remote = storage.flatRemote();

    await runtime.beforeChatRun({
      id: 'run-active',
      projectId: 'p-guard-up',
      teamverRemote: remote,
    });

    await hooks!.persistAfterMutation(
      mockReq('PUT', '/api/projects/p-guard-up/files/x', 'p-guard-up'),
      'p-guard-up',
    );

    expect(syncUpSpy).not.toHaveBeenCalled();

    const skipLines = infoSpy.mock.calls
      .map((call) => String(call[0] ?? ''))
      .filter((line) => line.includes('od_s3_lazy_sync_up_skipped_active_run'));
    expect(skipLines.length).toBe(1);
  });
});
