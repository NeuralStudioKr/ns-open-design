import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertTeamverProjectAccessIfNeeded,
  buildTeamverProjectRegistryPayload,
  ensureTeamverProjectRegisteredById,
  fetchTeamverProject,
  filterProjectsByTeamverRegistryIfNeeded,
  listTeamverRegisteredProjectIds,
  registerTeamverProjectIfNeeded,
  resetTeamverProjectRegistryStateForTests,
  syncAllDaemonProjectsToRegistry,
  unregisterTeamverProjectFromRegistryIfNeeded,
} from '../src/teamver/projectRegistry';
import * as designApiBase from '../src/teamver/designApiBase';
import * as designBffClient from '../src/teamver/designBffClient';
import { NetworkError } from '@teamver/app-sdk';

vi.mock('../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

vi.mock('../src/teamver/designBffClient', () => ({
  getDesignBffClient: vi.fn(() => null),
}));

describe('Teamver project registry payload', () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);
  });

  it('maps OD project id and title to SDK camelCase payload', () => {
    expect(
      buildTeamverProjectRegistryPayload({
        id: 'od-1',
        name: ' Landing page ',
      }),
    ).toEqual({
      odProjectId: 'od-1',
      title: 'Landing page',
    });
  });

  it('omits blank title', () => {
    expect(
      buildTeamverProjectRegistryPayload({
        id: 'od-2',
        name: '   ',
      }),
    ).toEqual({
      odProjectId: 'od-2',
    });
  });
});

describe('Teamver project registry list', () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);
  });

  it('returns null outside Teamver embed mode', async () => {
    await expect(listTeamverRegisteredProjectIds()).resolves.toBeNull();
  });

  it('filters projects when registry ids are available', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: {
        get: vi.fn(async () => ({
          projects: [{ odProjectId: 'p1' }, { odProjectId: 'p3' }],
        })),
      },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(
      filterProjectsByTeamverRegistryIfNeeded([
        { id: 'p1' },
        { id: 'p2' },
        { id: 'p3' },
      ]),
    ).resolves.toEqual([{ id: 'p1' }, { id: 'p3' }]);
  });
});

describe('Teamver project registry register', () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);
  });

  it('ignores 409 when project is already registered', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: {
        post: vi.fn(async () => {
          throw new NetworkError({ message: 'conflict', status: 409 });
        }),
      },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(
      registerTeamverProjectIfNeeded({ id: 'p1', name: 'Demo' }),
    ).resolves.toBeUndefined();
  });
});

describe('Teamver project registry access', () => {
  afterEach(() => {
    resetTeamverProjectRegistryStateForTests();
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('syncAllDaemonProjectsToRegistry is a no-op when legacy flag is unset', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const getClient = vi.mocked(designBffClient.getDesignBffClient);
    getClient.mockClear();
    getClient.mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: { get: vi.fn(), post: vi.fn() },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(syncAllDaemonProjectsToRegistry()).resolves.toBeUndefined();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('registers legacy daemon projects then checks registry membership', async () => {
    vi.stubEnv('VITE_TEAMVER_LEGACY_REGISTRY_SYNC', '1');
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    let registered = false;
    const post = vi.fn(async () => {
      registered = true;
    });
    const get = vi.fn(async (path: string) => {
      if (path !== '/projects') return undefined;
      return registered
        ? { projects: [{ odProjectId: 'legacy-1' }] }
        : { projects: [] };
    });
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: { get, post },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          projects: [{ id: 'legacy-1', name: 'Legacy', skillId: null, designSystemId: null }],
        }),
      ),
    );

    await expect(assertTeamverProjectAccessIfNeeded('legacy-1')).resolves.toBe(true);
    expect(post).toHaveBeenCalledWith(
      '/projects',
      { odProjectId: 'legacy-1', title: 'Legacy' },
      expect.objectContaining({ workspaceId: 'ws1' }),
    );
    expect(get).toHaveBeenCalledWith('/projects', expect.objectContaining({ workspaceId: 'ws1' }));
    expect(get).not.toHaveBeenCalledWith(
      '/projects/legacy-1/access',
      expect.anything(),
    );
  });

  it('caches repeated registry membership checks for the same project', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const get = vi.fn(async () => ({ projects: [{ odProjectId: 'cached-1' }] }));
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: { get, post: vi.fn() },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ projects: [] })),
    );

    await expect(assertTeamverProjectAccessIfNeeded('cached-1')).resolves.toBe(true);
    await expect(assertTeamverProjectAccessIfNeeded('cached-1')).resolves.toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('ensureTeamverProjectRegisteredById upserts from daemon list', async () => {
    vi.stubEnv('VITE_TEAMVER_LEGACY_REGISTRY_SYNC', '1');
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const post = vi.fn(async () => ({}));
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: { post },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          projects: [{ id: 'od-legacy', name: 'Old project', skillId: null, designSystemId: null }],
        }),
      ),
    );

    await ensureTeamverProjectRegisteredById('od-legacy');
    expect(post).toHaveBeenCalledWith(
      '/projects',
      { odProjectId: 'od-legacy', title: 'Old project' },
      expect.any(Object),
    );
  });

  it('fetchTeamverProject returns registry row', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: {
        get: vi.fn(async () => ({
          odProjectId: 'od1',
          s3Prefix: 'design/ws_ws1/user_u1/proj_od1/',
        })),
      },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(fetchTeamverProject('od1')).resolves.toMatchObject({
      odProjectId: 'od1',
      s3Prefix: 'design/ws_ws1/user_u1/proj_od1/',
    });
  });

  it('fetchTeamverProject returns null on 404', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: {
        get: vi.fn(async () => {
          throw new NetworkError({ message: 'missing', status: 404 });
        }),
      },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(fetchTeamverProject('missing')).resolves.toBeNull();
  });

  it('allows access outside embed mode', async () => {
    await expect(assertTeamverProjectAccessIfNeeded('p1')).resolves.toBe(true);
  });

  it('returns false when project is not in registry', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: {
        get: vi.fn(async () => ({ projects: [] })),
        post: vi.fn(),
      },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ projects: [] })));

    await expect(assertTeamverProjectAccessIfNeeded('p1-deny')).resolves.toBe(false);
  });

  it('returns false when registry list is unavailable (fail-closed)', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: {
        get: vi.fn(async () => {
          throw new NetworkError({ message: 'upstream', status: 502 });
        }),
      },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ projects: [] })));

    await expect(assertTeamverProjectAccessIfNeeded('p1-transient')).resolves.toBe(false);
  });
});

describe('Teamver project registry boot sync', () => {
  afterEach(() => {
    resetTeamverProjectRegistryStateForTests();
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('syncAllDaemonProjectsToRegistry does not wait on embed boot gate', async () => {
    vi.stubEnv('VITE_TEAMVER_LEGACY_REGISTRY_SYNC', '1');
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const post = vi.fn(async () => undefined);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: { post },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          projects: [{ id: 'od-boot-1', name: 'Boot project' }],
        }),
      ),
    );

    const boot = await import('../src/teamver/teamverEmbedBoot');
    boot.resetTeamverEmbedBootForTests();
    expect(boot.isTeamverEmbedBootComplete()).toBe(false);

    await syncAllDaemonProjectsToRegistry();

    expect(post).toHaveBeenCalledWith(
      '/projects',
      { odProjectId: 'od-boot-1', title: 'Boot project' },
      expect.objectContaining({ workspaceId: 'ws1' }),
    );
    expect(boot.isTeamverEmbedBootComplete()).toBe(false);
  });
});

describe('Teamver project registry delete', () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);
  });

  it('no-ops outside embed mode', async () => {
    await expect(unregisterTeamverProjectFromRegistryIfNeeded('p1')).resolves.toBeUndefined();
  });

  it('calls design-api DELETE with workspace scope', async () => {
    const del = vi.fn(async () => undefined);
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: { delete: del },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await unregisterTeamverProjectFromRegistryIfNeeded('p-del');
    expect(del).toHaveBeenCalledWith('/projects/p-del', {
      workspaceId: 'ws1',
      skipAuthHeader: true,
    });
  });
});
