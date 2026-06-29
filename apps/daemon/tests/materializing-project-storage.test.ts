import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MaterializingProjectStorage,
  resolveRemoteProjectStorage,
  shouldPropagateScratchDeletionsToRemote,
} from '../src/storage/materializing-project-storage.js';
import { LocalProjectStorage, S3ProjectStorage, type ProjectStorage } from '../src/storage/project-storage.js';
import { resolveProjectStorageLayout } from '../src/storage/project-storage-layout.js';
import { createProjectMaterializationRuntime } from '../src/storage/project-materialization-runtime.js';
import { TenantScopedProjectStorage } from '../src/storage/tenant-scoped-project-storage.js';
import { fetchTeamverProjectS3Prefix } from '../src/storage/teamver-project-storage-meta.js';

describe('resolveProjectStorageLayout', () => {
  it('defaults to local projects dir', () => {
    expect(resolveProjectStorageLayout({}, '/data')).toEqual({
      mode: 'local',
      projectsDir: '/data/projects',
    });
  });

  it('routes projects to scratch when s3 mode is enabled', () => {
    expect(
      resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data'),
    ).toEqual({
      mode: 's3',
      scratchDir: '/data/scratch',
      projectsDir: '/data/scratch/projects',
    });
  });
});

describe('shouldPropagateScratchDeletionsToRemote', () => {
  it('returns false when scratch is empty', () => {
    expect(shouldPropagateScratchDeletionsToRemote(0)).toBe(false);
  });

  it('returns false when OD_S3_PURGE_ON_DELETE=0 even with scratch files', () => {
    const previous = process.env.OD_S3_PURGE_ON_DELETE;
    process.env.OD_S3_PURGE_ON_DELETE = '0';
    try {
      expect(shouldPropagateScratchDeletionsToRemote(3)).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.OD_S3_PURGE_ON_DELETE;
      else process.env.OD_S3_PURGE_ON_DELETE = previous;
    }
  });

  it('returns true when scratch has files and purge is enabled', () => {
    const previous = process.env.OD_S3_PURGE_ON_DELETE;
    process.env.OD_S3_PURGE_ON_DELETE = '1';
    try {
      expect(shouldPropagateScratchDeletionsToRemote(2)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.OD_S3_PURGE_ON_DELETE;
      else process.env.OD_S3_PURGE_ON_DELETE = previous;
    }
  });
});

describe('MaterializingProjectStorage', () => {
  let scratchRoot = '';
  let remoteRoot = '';

  afterEach(async () => {
    await Promise.all([
      scratchRoot ? rm(scratchRoot, { recursive: true, force: true }) : Promise.resolve(),
      remoteRoot ? rm(remoteRoot, { recursive: true, force: true }) : Promise.resolve(),
    ]);
    scratchRoot = '';
    remoteRoot = '';
  });

  it('sync-down copies remote files into scratch', async () => {
    scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-scratch-'));
    remoteRoot = await mkdtemp(path.join(tmpdir(), 'od-remote-'));
    const remoteDir = path.join(remoteRoot, 'p1');
    await mkdir(remoteDir, { recursive: true });
    await writeFile(path.join(remoteDir, 'index.html'), '<h1>remote</h1>');

    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const remote = storage.flatRemote();

    const down = await storage.syncDown('p1', remote);
    expect(down.files).toBe(1);
    const local = await storage.readFile('p1', 'index.html');
    expect(local.toString('utf8')).toBe('<h1>remote</h1>');
  });

  it('sync-down retries transient remote list/read failures', async () => {
    const previousRetries = process.env.OD_S3_SYNC_DOWN_RETRIES;
    const previousRetryMs = process.env.OD_S3_SYNC_DOWN_RETRY_MS;
    process.env.OD_S3_SYNC_DOWN_RETRIES = '2';
    process.env.OD_S3_SYNC_DOWN_RETRY_MS = '0';
    scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-scratch-'));
    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage('/tmp/unused-remote'),
    );
    const remote: ProjectStorage = {
      listFiles: vi.fn()
        .mockRejectedValueOnce(new Error('s3 list failed'))
        .mockResolvedValueOnce([{ path: 'index.html', size: 15, mtimeMs: Date.now() }]),
      readFile: vi.fn()
        .mockRejectedValueOnce(new Error('s3 read failed'))
        .mockResolvedValueOnce(Buffer.from('<h1>remote</h1>')),
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      statFile: vi.fn(),
    };

    try {
      const down = await storage.syncDown('p1', remote);
      expect(down.files).toBe(1);
      expect(remote.listFiles).toHaveBeenCalledTimes(2);
      expect(remote.readFile).toHaveBeenCalledTimes(2);
      const local = await storage.readFile('p1', 'index.html');
      expect(local.toString('utf8')).toBe('<h1>remote</h1>');
    } finally {
      if (previousRetries === undefined) delete process.env.OD_S3_SYNC_DOWN_RETRIES;
      else process.env.OD_S3_SYNC_DOWN_RETRIES = previousRetries;
      if (previousRetryMs === undefined) delete process.env.OD_S3_SYNC_DOWN_RETRY_MS;
      else process.env.OD_S3_SYNC_DOWN_RETRY_MS = previousRetryMs;
    }
  });

  it('sync-up uploads run-touched scratch files only', async () => {
    scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-scratch-'));
    remoteRoot = await mkdtemp(path.join(tmpdir(), 'od-remote-'));

    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const remote = storage.flatRemote();

    await storage.writeFile('p1', 'old.txt', Buffer.from('old'));
    await new Promise((r) => setTimeout(r, 1100));
    const runStart = Date.now();
    await storage.writeFile('p1', 'new.txt', Buffer.from('new'));

    const up = await storage.syncUp('p1', remote, runStart);
    expect(up.uploaded).toBe(1);
    expect(up.skipped).toBe(1);
    expect(up.failed).toBe(0);

    const remoteStore = new LocalProjectStorage(remoteRoot);
    await expect(remoteStore.readFile('p1', 'new.txt')).resolves.toEqual(Buffer.from('new'));
    await expect(remoteStore.statFile('p1', 'old.txt')).resolves.toBeNull();
  });

  it('sync-up with runStart=0 deletes remote files missing from scratch when purge enabled', async () => {
    const previousPurge = process.env.OD_S3_PURGE_ON_DELETE;
    process.env.OD_S3_PURGE_ON_DELETE = '1';
    scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-scratch-'));
    remoteRoot = await mkdtemp(path.join(tmpdir(), 'od-remote-'));

    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const remote = storage.flatRemote();
    const remoteStore = new LocalProjectStorage(remoteRoot);

    await remoteStore.writeFile('p1', 'stale.txt', Buffer.from('stale'));
    await storage.writeFile('p1', 'keep.txt', Buffer.from('keep'));

    try {
      const up = await storage.syncUp('p1', remote, 0);
      expect(up.uploaded).toBe(1);
      expect(up.deleted).toBe(1);
      expect(up.failed).toBe(0);
      await expect(remoteStore.statFile('p1', 'keep.txt')).resolves.not.toBeNull();
      await expect(remoteStore.statFile('p1', 'stale.txt')).resolves.toBeNull();
    } finally {
      if (previousPurge === undefined) delete process.env.OD_S3_PURGE_ON_DELETE;
      else process.env.OD_S3_PURGE_ON_DELETE = previousPurge;
    }
  });

  it('sync-up with runStart=0 does not delete remote when scratch is empty', async () => {
    scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-scratch-'));
    remoteRoot = await mkdtemp(path.join(tmpdir(), 'od-remote-'));

    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const remote = storage.flatRemote();
    const remoteStore = new LocalProjectStorage(remoteRoot);

    await remoteStore.writeFile('p1', 'only-remote.txt', Buffer.from('keep-me'));

    const up = await storage.syncUp('p1', remote, 0);
    expect(up.uploaded).toBe(0);
    expect(up.deleted).toBe(0);
    expect(up.failed).toBe(0);
    await expect(remoteStore.statFile('p1', 'only-remote.txt')).resolves.not.toBeNull();
  });

  it('sync-up with runStart=0 does not delete remote orphans when OD_S3_PURGE_ON_DELETE=0', async () => {
    const previousPurge = process.env.OD_S3_PURGE_ON_DELETE;
    process.env.OD_S3_PURGE_ON_DELETE = '0';
    scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-scratch-'));
    remoteRoot = await mkdtemp(path.join(tmpdir(), 'od-remote-'));

    const storage = new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
    const remote = storage.flatRemote();
    const remoteStore = new LocalProjectStorage(remoteRoot);

    await remoteStore.writeFile('p1', 'stale.txt', Buffer.from('stale'));
    await storage.writeFile('p1', 'keep.txt', Buffer.from('keep'));

    try {
      const up = await storage.syncUp('p1', remote, 0);
      expect(up.uploaded).toBe(1);
      expect(up.deleted).toBe(0);
      expect(up.failed).toBe(0);
      await expect(remoteStore.statFile('p1', 'keep.txt')).resolves.not.toBeNull();
      await expect(remoteStore.statFile('p1', 'stale.txt')).resolves.not.toBeNull();
    } finally {
      if (previousPurge === undefined) delete process.env.OD_S3_PURGE_ON_DELETE;
      else process.env.OD_S3_PURGE_ON_DELETE = previousPurge;
    }
  });
});

describe('TenantScopedProjectStorage', () => {
  it('maps tenant prefix paths for local storage', async () => {
    const remoteRoot = await mkdtemp(path.join(tmpdir(), 'od-tenant-'));
    try {
      const inner = new LocalProjectStorage(remoteRoot);
      const tenant = new TenantScopedProjectStorage(inner, 'design/ws_ws1/user_u1/proj_p1/');
      await tenant.writeFile('p1', 'page.html', Buffer.from('<p>tenant</p>'));

      const storage = new MaterializingProjectStorage(
        new LocalProjectStorage(await mkdtemp(path.join(tmpdir(), 'od-scratch-tenant-'))),
        inner,
      );
      const down = await storage.syncDown('p1', tenant);
      expect(down.files).toBe(1);
      expect((await storage.readFile('p1', 'page.html')).toString('utf8')).toBe('<p>tenant</p>');
    } finally {
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });
});

describe('fetchTeamverProjectS3Prefix', () => {
  it('reads prefix from access response header', async () => {
    const previous = process.env.TEAMVER_DESIGN_API_URL;
    process.env.TEAMVER_DESIGN_API_URL = 'http://design-api:8000';
    const fetchFn = vi.fn(async () => new Response(null, {
      status: 204,
      headers: { 'X-Teamver-S3-Prefix': 'design/ws_ws1/user_u1/proj_od1/' },
    }));
    vi.stubGlobal('fetch', fetchFn);

    try {
      await expect(
        fetchTeamverProjectS3Prefix('od1', { userId: 'u1', workspaceId: 'ws1' }),
      ).resolves.toBe('design/ws_ws1/user_u1/proj_od1/');
    } finally {
      if (previous === undefined) delete process.env.TEAMVER_DESIGN_API_URL;
      else process.env.TEAMVER_DESIGN_API_URL = previous;
      vi.unstubAllGlobals();
    }
  });
});

describe('resolveRemoteProjectStorage', () => {
  it('returns null outside s3 mode', async () => {
    await expect(resolveRemoteProjectStorage({ env: {} })).resolves.toBeNull();
  });

  it('builds S3ProjectStorage from env credentials', async () => {
    const storage = await resolveRemoteProjectStorage({
      env: {
        OD_PROJECT_STORAGE: 's3',
        OD_S3_BUCKET: 'bucket',
        OD_S3_REGION: 'ap-northeast-2',
        OD_S3_ACCESS_KEY_ID: 'AK',
        OD_S3_SECRET_ACCESS_KEY: 'SK',
      },
    });
    expect(storage).toBeInstanceOf(S3ProjectStorage);
  });
});

describe('createProjectMaterializationRuntime', () => {
  it('wraps finish to trigger sync-up', async () => {
    const scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-runtime-'));
    const remoteRoot = await mkdtemp(path.join(tmpdir(), 'od-runtime-remote-'));
    try {
      const storage = new MaterializingProjectStorage(
        new LocalProjectStorage(scratchRoot),
        new LocalProjectStorage(remoteRoot),
      );
      const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
      const runtime = createProjectMaterializationRuntime(layout, storage);
      const run = {
        id: 'run-1',
        projectId: 'p1',
        projectMaterializationStartedAt: Date.now(),
      };

      await runtime.beforeChatRun(run);
      await storage.writeFile('p1', 'out.html', Buffer.from('<p>hi</p>'));

      const finish = vi.fn();
      runtime.wrapFinish(finish)(run, 'succeeded', 0, null);
      await new Promise((r) => setTimeout(r, 20));

      expect(finish).toHaveBeenCalled();
      const remote = new LocalProjectStorage(remoteRoot);
      const meta = await remote.statFile('p1', 'out.html');
      expect(meta).not.toBeNull();
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it('sync-up uses earliest run floor when concurrent runs overlap', async () => {
    const scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-runtime-concurrent-'));
    const remoteRoot = await mkdtemp(path.join(tmpdir(), 'od-runtime-concurrent-remote-'));
    try {
      const storage = new MaterializingProjectStorage(
        new LocalProjectStorage(scratchRoot),
        new LocalProjectStorage(remoteRoot),
      );
      const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
      const runtime = createProjectMaterializationRuntime(layout, storage);

      const run1: { id: string; projectId: string; projectMaterializationStartedAt?: number } = { id: 'run-1', projectId: 'p1' };
      await runtime.beforeChatRun(run1);
      const run1Start = run1.projectMaterializationStartedAt!;

      const run2 = { id: 'run-2', projectId: 'p1' };
      await runtime.beforeChatRun(run2);

      await new Promise((r) => setTimeout(r, 50));
      const betweenRuns = Date.now();
      await storage.writeFile('p1', 'run1.html', Buffer.from('from-run-1'));

      await new Promise((r) => setTimeout(r, 1100));
      await storage.writeFile('p1', 'run2.html', Buffer.from('from-run-2'));

      const finish = vi.fn();
      runtime.wrapFinish(finish)(run1, 'succeeded', 0, null);
      await new Promise((r) => setTimeout(r, 20));
      runtime.wrapFinish(finish)(run2, 'succeeded', 0, null);
      await new Promise((r) => setTimeout(r, 50));

      const remote = new LocalProjectStorage(remoteRoot);
      expect(await remote.statFile('p1', 'run1.html')).not.toBeNull();
      expect(await remote.statFile('p1', 'run2.html')).not.toBeNull();
      expect(run1Start).toBeLessThan(betweenRuns);
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it('emits od_s3_sync_down marker when metrics enabled on beforeChatRun', async () => {
    const scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-runtime-syncdown-'));
    const remoteRoot = await mkdtemp(path.join(tmpdir(), 'od-runtime-syncdown-remote-'));
    const previousMetrics = process.env.OD_S3_SYNC_UP_METRICS;
    process.env.OD_S3_SYNC_UP_METRICS = '1';
    try {
      const storage = new MaterializingProjectStorage(
        new LocalProjectStorage(scratchRoot),
        new LocalProjectStorage(remoteRoot),
      );
      const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
      const runtime = createProjectMaterializationRuntime(layout, storage);
      const infos: string[] = [];
      const infoSpy = vi.spyOn(console, 'info').mockImplementation((m: unknown) => {
        if (typeof m === 'string') infos.push(m);
      });
      try {
        await runtime.beforeChatRun({ id: 'run-sd', projectId: 'p-sd' });
        const marker = infos.find((line) => line.includes('"metric":"od_s3_sync_down"'));
        expect(marker, infos.join('\n')).toBeTruthy();
        expect(marker).toContain('"projectId":"p-sd"');
      } finally {
        infoSpy.mockRestore();
      }
    } finally {
      if (previousMetrics === undefined) delete process.env.OD_S3_SYNC_UP_METRICS;
      else process.env.OD_S3_SYNC_UP_METRICS = previousMetrics;
      await rm(scratchRoot, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it('emits od_s3_sync_up_failed marker when run-end sync-up throws', async () => {
    const scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-runtime-throw-'));
    const previousRetries = process.env.OD_S3_RUN_END_SYNC_UP_RETRIES;
    process.env.OD_S3_RUN_END_SYNC_UP_RETRIES = '1';
    try {
      const fakeRemote = {
        listFiles: async () => [],
        readFile: async () => Buffer.alloc(0),
        writeFile: async () => ({ path: '', size: 0, mtimeMs: 0 }),
        deleteFile: async () => {},
        statFile: async () => null,
      };
      const storage = new MaterializingProjectStorage(
        new LocalProjectStorage(scratchRoot),
        fakeRemote as any,
      );
      const boom = new Error('s3 unreachable');
      vi.spyOn(storage, 'syncUp').mockRejectedValue(boom);
      const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
      const runtime = createProjectMaterializationRuntime(layout, storage);
      const infos: string[] = [];
      const infoSpy = vi.spyOn(console, 'info').mockImplementation((m: unknown) => {
        if (typeof m === 'string') infos.push(m);
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const run = { id: 'r-1', projectId: 'p-fail', projectMaterializationStartedAt: Date.now() };
        await runtime.beforeChatRun(run);
        const finish = vi.fn();
        runtime.wrapFinish(finish)(run, 'failed', 0, null);
        await new Promise((r) => setTimeout(r, 20));

        const marker = infos.find((line) => line.includes('"metric":"od_s3_sync_up_failed"'));
        expect(marker, infos.join('\n')).toBeTruthy();
        expect(marker).toContain('"stage":"run_end_exception"');
        expect(marker).toContain('"projectId":"p-fail"');
      } finally {
        infoSpy.mockRestore();
        warnSpy.mockRestore();
      }
    } finally {
      if (previousRetries === undefined) delete process.env.OD_S3_RUN_END_SYNC_UP_RETRIES;
      else process.env.OD_S3_RUN_END_SYNC_UP_RETRIES = previousRetries;
      await rm(scratchRoot, { recursive: true, force: true });
    }
  });

  it('emits od_s3_sync_up_failed marker when some files fail on sync-up', async () => {
    const scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-runtime-fail-'));
    const previousEvict = process.env.OD_SCRATCH_EVICT_AFTER_RUN;
    const previousRetries = process.env.OD_S3_RUN_END_SYNC_UP_RETRIES;
    process.env.OD_SCRATCH_EVICT_AFTER_RUN = '1';
    process.env.OD_S3_RUN_END_SYNC_UP_RETRIES = '1';
    try {
      const fakeRemote = {
        listFiles: async () => [],
        readFile: async () => Buffer.alloc(0),
        writeFile: async () => ({ path: '', size: 0, mtimeMs: 0 }),
        deleteFile: async () => {},
        statFile: async () => null,
      };
      const storage = new MaterializingProjectStorage(
        new LocalProjectStorage(scratchRoot),
        fakeRemote as any,
      );
      vi.spyOn(storage, 'syncUp').mockResolvedValue({ uploaded: 2, skipped: 1, deleted: 0, failed: 1 });
      const evict = vi.spyOn(storage, 'evictScratchProject').mockResolvedValue(undefined);
      const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
      const runtime = createProjectMaterializationRuntime(layout, storage);
      const infos: string[] = [];
      const infoSpy = vi.spyOn(console, 'info').mockImplementation((m: unknown) => {
        if (typeof m === 'string') infos.push(m);
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const run = { id: 'r-2', projectId: 'p-partial', projectMaterializationStartedAt: Date.now() };
        await runtime.beforeChatRun(run);
        const finish = vi.fn();
        runtime.wrapFinish(finish)(run, 'succeeded', 0, null);
        await new Promise((r) => setTimeout(r, 20));

        const marker = infos.find((line) => line.includes('"metric":"od_s3_sync_up_failed"'));
        expect(marker, infos.join('\n')).toBeTruthy();
        expect(marker).toContain('"stage":"run_end"');
        expect(marker).toContain('"failed":1');
        expect(marker).toContain('"uploaded":2');
        expect(evict).not.toHaveBeenCalled();
      } finally {
        infoSpy.mockRestore();
        warnSpy.mockRestore();
      }
    } finally {
      if (previousEvict === undefined) delete process.env.OD_SCRATCH_EVICT_AFTER_RUN;
      else process.env.OD_SCRATCH_EVICT_AFTER_RUN = previousEvict;
      if (previousRetries === undefined) delete process.env.OD_S3_RUN_END_SYNC_UP_RETRIES;
      else process.env.OD_S3_RUN_END_SYNC_UP_RETRIES = previousRetries;
      await rm(scratchRoot, { recursive: true, force: true });
    }
  });

  it('retries run-end sync-up before marking project failed', async () => {
    const scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-runtime-retry-'));
    const previousEvict = process.env.OD_SCRATCH_EVICT_AFTER_RUN;
    const previousRetries = process.env.OD_S3_RUN_END_SYNC_UP_RETRIES;
    const previousRetryMs = process.env.OD_S3_RUN_END_SYNC_UP_RETRY_MS;
    const previousMetrics = process.env.OD_S3_SYNC_UP_METRICS;
    process.env.OD_SCRATCH_EVICT_AFTER_RUN = '1';
    process.env.OD_S3_RUN_END_SYNC_UP_RETRIES = '2';
    process.env.OD_S3_RUN_END_SYNC_UP_RETRY_MS = '0';
    process.env.OD_S3_SYNC_UP_METRICS = '1';
    try {
      const fakeRemote = {
        listFiles: async () => [{ path: 'index.html', size: 10, mtimeMs: Date.now() }],
        readFile: async () => Buffer.alloc(0),
        writeFile: async () => ({ path: '', size: 0, mtimeMs: 0 }),
        deleteFile: async () => {},
        statFile: async () => null,
      };
      const storage = new MaterializingProjectStorage(
        new LocalProjectStorage(scratchRoot),
        fakeRemote as any,
      );
      const syncUp = vi.spyOn(storage, 'syncUp')
        .mockResolvedValueOnce({ uploaded: 1, skipped: 0, deleted: 0, failed: 1 })
        .mockResolvedValueOnce({ uploaded: 2, skipped: 0, deleted: 0, failed: 0 });
      const evict = vi.spyOn(storage, 'evictScratchProject').mockResolvedValue(undefined);
      const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
      const runtime = createProjectMaterializationRuntime(layout, storage);
      const infos: string[] = [];
      const infoSpy = vi.spyOn(console, 'info').mockImplementation((m: unknown) => {
        if (typeof m === 'string') infos.push(m);
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const run = { id: 'r-retry', projectId: 'p-retry', projectMaterializationStartedAt: Date.now() };
        await runtime.beforeChatRun(run);
        const finish = vi.fn();
        runtime.wrapFinish(finish)(run, 'succeeded', 0, null);
        await new Promise((r) => setTimeout(r, 20));

        expect(syncUp).toHaveBeenCalledTimes(2);
        expect(evict).toHaveBeenCalled();
        expect(infos.some((line) => line.includes('"metric":"od_s3_run_end_sync_up_retry"'))).toBe(true);
        expect(infos.some((line) => line.includes('"metric":"od_s3_sync_up_failed"'))).toBe(false);
      } finally {
        infoSpy.mockRestore();
        warnSpy.mockRestore();
      }
    } finally {
      if (previousEvict === undefined) delete process.env.OD_SCRATCH_EVICT_AFTER_RUN;
      else process.env.OD_SCRATCH_EVICT_AFTER_RUN = previousEvict;
      if (previousRetries === undefined) delete process.env.OD_S3_RUN_END_SYNC_UP_RETRIES;
      else process.env.OD_S3_RUN_END_SYNC_UP_RETRIES = previousRetries;
      if (previousRetryMs === undefined) delete process.env.OD_S3_RUN_END_SYNC_UP_RETRY_MS;
      else process.env.OD_S3_RUN_END_SYNC_UP_RETRY_MS = previousRetryMs;
      if (previousMetrics === undefined) delete process.env.OD_S3_SYNC_UP_METRICS;
      else process.env.OD_S3_SYNC_UP_METRICS = previousMetrics;
      await rm(scratchRoot, { recursive: true, force: true });
    }
  });
});
