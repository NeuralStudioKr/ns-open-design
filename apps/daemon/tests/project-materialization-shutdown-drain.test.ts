import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MaterializingProjectStorage } from '../src/storage/materializing-project-storage.js';
import { LocalProjectStorage } from '../src/storage/project-storage.js';
import { createProjectMaterializationRuntime } from '../src/storage/project-materialization-runtime.js';
import { resolveProjectStorageLayout } from '../src/storage/project-storage-layout.js';

describe('drainAfterChatRun', () => {
  let scratchRoot: string;
  let remoteRoot: string;

  beforeEach(async () => {
    scratchRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-shutdown-drain-scratch-'));
    remoteRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-shutdown-drain-remote-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(scratchRoot, { recursive: true, force: true });
    await fs.rm(remoteRoot, { recursive: true, force: true });
  });

  it('awaits in-flight afterChatRun work started by wrapFinish', async () => {
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, storage);
    const remote = storage.flatRemote();
    const projectId = 'p-drain';
    const startedAt = Date.now();

    let syncUpStarted = false;
    let releaseSyncUp!: () => void;
    const syncUpGate = new Promise<void>((resolve) => {
      releaseSyncUp = resolve;
    });
    vi.spyOn(storage, 'syncUp').mockImplementation(async () => {
      syncUpStarted = true;
      await syncUpGate;
      return { uploaded: 0, skipped: 0, failed: 0, deleted: 0 };
    });

    await runtime.beforeChatRun({
      id: 'run-drain',
      projectId,
      teamverRemote: remote,
      projectMaterializationStartedAt: startedAt,
    });

    const finish = runtime.wrapFinish(() => undefined);
    finish({
      id: 'run-drain',
      projectId,
      teamverRemote: remote,
      projectMaterializationStartedAt: startedAt,
    });

    await vi.waitFor(() => {
      expect(syncUpStarted).toBe(true);
    });

    let drained = false;
    const drainPromise = runtime.drainAfterChatRun().then(() => {
      drained = true;
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(drained).toBe(false);

    releaseSyncUp();
    await drainPromise;
    expect(drained).toBe(true);
  });
});
