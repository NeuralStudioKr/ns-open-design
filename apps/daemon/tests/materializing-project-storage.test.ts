import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MaterializingProjectStorage,
  resolveRemoteProjectStorage,
} from '../src/storage/materializing-project-storage.js';
import { LocalProjectStorage, S3ProjectStorage } from '../src/storage/project-storage.js';
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
});
