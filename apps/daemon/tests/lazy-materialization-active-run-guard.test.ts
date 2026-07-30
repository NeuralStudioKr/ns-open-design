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

  it('active-run sync-up skip keeps lastSyncAt so the next GET does not sync-down stale S3', async () => {
    process.env.OD_PROJECT_LAZY_SYNC_TTL_MS = '60000';
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const hooks = createProjectStorageAccessHooks(runtime);
    expect(hooks).not.toBeNull();

    const syncDownSpy = vi.spyOn(storage, 'syncDown').mockResolvedValue({ files: 0 });
    const syncUpSpy = vi.spyOn(storage, 'syncUp').mockResolvedValue({
      uploaded: 1,
      skipped: 0,
      failed: 0,
      deleted: 0,
    });
    const remote = storage.flatRemote();

    // Prime lastSyncAt via a successful lazy sync-down.
    await hooks!.ensureMaterialized(
      mockReq('GET', '/api/projects/p-ttl/files', 'p-ttl'),
      'p-ttl',
    );
    expect(syncDownSpy).toHaveBeenCalledTimes(1);
    syncDownSpy.mockClear();

    await runtime.beforeChatRun({
      id: 'run-ttl',
      projectId: 'p-ttl',
      teamverRemote: remote,
    });

    await hooks!.persistAfterMutation(
      mockReq('PUT', '/api/projects/p-ttl/files/deck.html', 'p-ttl'),
      'p-ttl',
    );
    expect(syncUpSpy).not.toHaveBeenCalled();

    // Finish the run so ensureMaterialized is no longer short-circuited by
    // the active-run guard — only the TTL / lastSyncAt path remains.
    runtime.wrapFinish(vi.fn())(
      {
        id: 'run-ttl',
        projectId: 'p-ttl',
        projectMaterializationStartedAt: Date.now(),
        teamverRemote: remote,
      },
      'succeeded',
      0,
      null,
    );
    await runtime.drainAfterChatRun();
    // Run-end eviction heuristics must not force a sync-down in this TTL check.
    runtime.clearProjectSyncFailed('p-ttl');
    syncDownSpy.mockClear();

    await hooks!.ensureMaterialized(
      mockReq('GET', '/api/projects/p-ttl/files', 'p-ttl'),
      'p-ttl',
    );
    expect(syncDownSpy).not.toHaveBeenCalled();
  });

  it('registers persistInflight before awaiting prior persist so concurrent GET waits', async () => {
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const hooks = createProjectStorageAccessHooks(runtime);
    expect(hooks).not.toBeNull();

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let syncUpCalls = 0;
    const syncUpSpy = vi.spyOn(storage, 'syncUp').mockImplementation(async () => {
      syncUpCalls += 1;
      if (syncUpCalls === 1) {
        await firstGate;
      }
      return { uploaded: 1, skipped: 0, failed: 0, deleted: 0 };
    });
    const syncDownSpy = vi.spyOn(storage, 'syncDown').mockResolvedValue({ files: 0 });

    const firstPersist = hooks!.persistAfterMutation(
      mockReq('POST', '/api/projects/p-race/files', 'p-race'),
      'p-race',
    );
    await vi.waitFor(() => expect(syncUpSpy).toHaveBeenCalledTimes(1));

    // Second persist must park a gate immediately; concurrent ensureMaterialized
    // must await that gate (not race into sync-down while sync-up is in flight).
    const secondPersist = hooks!.persistAfterMutation(
      mockReq('POST', '/api/projects/p-race/files', 'p-race'),
      'p-race',
    );
    const ensurePromise = hooks!.ensureMaterialized(
      mockReq('GET', '/api/projects/p-race/files', 'p-race'),
      'p-race',
    );

    await new Promise((r) => setTimeout(r, 40));
    expect(syncDownSpy).not.toHaveBeenCalled();

    releaseFirst();
    await Promise.all([firstPersist, secondPersist, ensurePromise]);
    expect(syncUpSpy).toHaveBeenCalledTimes(2);
    expect(syncDownSpy).toHaveBeenCalled();
  });
});
