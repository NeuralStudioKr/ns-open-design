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
});
