import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MaterializingProjectStorage } from '../src/storage/materializing-project-storage.js';
import { LocalProjectStorage } from '../src/storage/project-storage.js';
import { createProjectMaterializationRuntime } from '../src/storage/project-materialization-runtime.js';
import { resolveProjectStorageLayout } from '../src/storage/project-storage-layout.js';

describe('beforeChatRun rollback on sync-down failure', () => {
  let scratchRoot: string;
  let remoteRoot: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    scratchRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-before-rollback-scratch-'));
    remoteRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-before-rollback-remote-'));
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(async () => {
    infoSpy.mockRestore();
    vi.restoreAllMocks();
    await fs.rm(scratchRoot, { recursive: true, force: true });
    await fs.rm(remoteRoot, { recursive: true, force: true });
  });

  it('clears active run counter when sync-down throws on first materialized run', async () => {
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const remote = storage.flatRemote();

    vi.spyOn(storage, 'syncDown').mockRejectedValue(new Error('S3 sync-down unavailable'));

    await expect(
      runtime.beforeChatRun({
        id: 'run-fail',
        projectId: 'p-rollback',
        teamverRemote: remote,
      }),
    ).rejects.toThrow('S3 sync-down unavailable');

    expect(runtime.getActiveRunCount('p-rollback')).toBe(0);

    const rollbackLines = infoSpy.mock.calls
      .map((call) => String(call[0] ?? ''))
      .filter((line) => line.includes('od_s3_before_chat_run_rollback'));
    expect(rollbackLines.length).toBe(1);
    const parsed = JSON.parse(rollbackLines[0]!);
    expect(parsed.projectId).toBe('p-rollback');
    expect(parsed.runId).toBe('run-fail');
  });

  it('clears active run counter when remote resolve throws before sync-down', async () => {
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);

    const meta = await import('../src/storage/teamver-project-storage-meta.js');
    vi.spyOn(meta, 'resolveTeamverTenantRemoteStorage').mockRejectedValue(
      new Error('tenant remote resolve failed'),
    );

    await expect(
      runtime.beforeChatRun({
        id: 'run-resolve-fail',
        projectId: 'p-resolve',
        teamverIdentity: { userId: 'u1', workspaceId: 'ws1' },
      }),
    ).rejects.toThrow('tenant remote resolve failed');

    expect(runtime.getActiveRunCount('p-resolve')).toBe(0);
  });

  /**
   * Rollback must not corrupt bookkeeping when a concurrent run is also
   * holding `activeProjectRuns` for the same project. The pre-fix
   * rollback used absolute `set(prev)` / `delete()` which wiped the
   * concurrent run's share — leaving idle-evict to delete unsynced
   * scratch as soon as the surviving run finished.
   */
  it('preserves concurrent run bookkeeping when first-active path rolls back', async () => {
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const remote = storage.flatRemote();

    let syncDownStarted = false;
    let releaseSyncDown!: (err?: Error) => void;
    const syncDownGate = new Promise<void>((resolve, reject) => {
      releaseSyncDown = (err) => (err ? reject(err) : resolve());
    });
    vi.spyOn(storage, 'syncDown').mockImplementation(async () => {
      syncDownStarted = true;
      await syncDownGate;
      // never reached — releaseSyncDown rejects
      return { files: 0 };
    });

    // Run A: enters first-active path, blocks on syncDown gate.
    const runAPromise = runtime
      .beforeChatRun({ id: 'run-a', projectId: 'p-concurrent', teamverRemote: remote })
      .then(() => 'ok')
      .catch((err) => err);

    await vi.waitFor(() => {
      expect(syncDownStarted).toBe(true);
    });

    // Run B: enters concurrent path while A holds the gate. Increments
    // `activeProjectRuns` to 2; sync-down is skipped per v1 policy.
    await runtime.beforeChatRun({
      id: 'run-b',
      projectId: 'p-concurrent',
      teamverRemote: remote,
    });
    expect(runtime.getActiveRunCount('p-concurrent')).toBe(2);

    // Now make A fail.
    releaseSyncDown(new Error('S3 sync-down unavailable'));
    const runAResult = await runAPromise;
    expect(runAResult).toBeInstanceOf(Error);

    // Pre-fix bug: A's rollback `delete(projectId)` would wipe BOTH
    // shares → count drops to 0 → B is now treated as idle.
    // Post-fix: A's rollback only decrements its share → count remains
    // 1 (B still active).
    expect(runtime.getActiveRunCount('p-concurrent')).toBe(1);

    // Wind B down cleanly so afterEach cleanup is quiet.
    vi.spyOn(storage, 'syncUp').mockResolvedValue({
      uploaded: 0,
      skipped: 0,
      failed: 0,
      deleted: 0,
    });
    await runtime.afterChatRun({
      id: 'run-b',
      projectId: 'p-concurrent',
      teamverRemote: remote,
    });
    expect(runtime.getActiveRunCount('p-concurrent')).toBe(0);
  });

  /**
   * Mirror coverage for the concurrent-branch rollback path: when a
   * concurrent run's `resolveRunRemote` call fails, the rollback must
   * not delete the first-active run's active-run share.
   */
  it('preserves first-active run bookkeeping when concurrent path rolls back', async () => {
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const remote = storage.flatRemote();

    let resolveCalls = 0;
    let releaseFirstResolve!: () => void;
    const firstResolveGate = new Promise<void>((resolve) => {
      releaseFirstResolve = resolve;
    });
    const meta = await import('../src/storage/teamver-project-storage-meta.js');
    const resolveMock = vi
      .spyOn(meta, 'resolveTeamverTenantRemoteStorage')
      .mockImplementation(async () => {
        resolveCalls += 1;
        if (resolveCalls === 1) {
          await firstResolveGate;
          return remote;
        }
        throw new Error('tenant resolve race');
      });

    // Run A: first-active path blocks on resolve before tenant remote is cached.
    const runAPromise = runtime
      .beforeChatRun({
        id: 'run-a',
        projectId: 'p-concurrent-rb',
        teamverIdentity: { userId: 'u1', workspaceId: 'ws1' },
      })
      .then(() => 'ok')
      .catch((err) => err);

    await vi.waitFor(() => {
      expect(resolveCalls).toBe(1);
    });
    expect(runtime.getActiveRunCount('p-concurrent-rb')).toBe(1);

    // Run B: concurrent path, no cached remote yet — resolve throws.
    await expect(
      runtime.beforeChatRun({
        id: 'run-b',
        projectId: 'p-concurrent-rb',
        teamverIdentity: { userId: 'u1', workspaceId: 'ws1' },
      }),
    ).rejects.toThrow('tenant resolve race');

    expect(runtime.getActiveRunCount('p-concurrent-rb')).toBe(1);

    releaseFirstResolve();
    vi.spyOn(storage, 'syncDown').mockResolvedValue({ files: 0 });
    const runAResult = await runAPromise;
    expect(runAResult).toBe('ok');

    resolveMock.mockRestore();
    vi.spyOn(storage, 'syncUp').mockResolvedValue({
      uploaded: 0,
      skipped: 0,
      failed: 0,
      deleted: 0,
    });
    await runtime.afterChatRun({
      id: 'run-a',
      projectId: 'p-concurrent-rb',
      teamverRemote: remote,
    });
    expect(runtime.getActiveRunCount('p-concurrent-rb')).toBe(0);
  });
});
