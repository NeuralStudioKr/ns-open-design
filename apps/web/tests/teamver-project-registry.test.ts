import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolveActiveTeamverWorkspaceIdMock = vi.hoisted(() =>
  vi.fn(async (): Promise<string | null> => 'ws1'),
);

import {
  assertTeamverProjectAccessIfNeeded,
  buildTeamverProjectRegistryPayload,
  ensureTeamverProjectRegisteredById,
  fetchTeamverProject,
  filterProjectsByTeamverRegistryIfNeeded,
  listTeamverRegisteredProjectIds,
  formatTeamverProjectRegistryErrorMessage,
  formatTeamverProjectAccessDeniedMessage,
  formatTeamverProjectNotFoundMessage,
  registerTeamverProjectIfNeeded,
  resetTeamverProjectRegistryStateForTests,
  syncAllDaemonProjectsToRegistry,
  TeamverProjectRegistryError,
  unregisterTeamverProjectFromRegistryIfNeeded,
} from '../src/teamver/projectRegistry';
import {
  readTeamverProjectS3Prefix,
  clearAllTeamverProjectS3PrefixCache,
} from '../src/teamver/teamverProjectS3PrefixCache';
import * as designApiBase from '../src/teamver/designApiBase';
import * as designBffClient from '../src/teamver/designBffClient';
import { NetworkError } from '@teamver/app-sdk';

vi.mock('../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

vi.mock('../src/teamver/activeTeamverWorkspace', () => ({
  resolveActiveTeamverWorkspaceId: (...args: unknown[]) =>
    resolveActiveTeamverWorkspaceIdMock(...args),
  resolveActiveTeamverWorkspaceIdForEmbed: (...args: unknown[]) =>
    resolveActiveTeamverWorkspaceIdMock(...args),
  requireActiveTeamverWorkspaceId: async () => {
    const workspaceId = await resolveActiveTeamverWorkspaceIdMock();
    if (!workspaceId) throw new Error('teamver_workspace_required');
    return workspaceId;
  },
  readActiveTeamverWorkspaceId: (...args: unknown[]) =>
    resolveActiveTeamverWorkspaceIdMock(...args),
}));

vi.mock('../src/teamver/teamverEmbedBoot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/teamver/teamverEmbedBoot')>();
  return {
    ...actual,
    waitForTeamverEmbedBoot: vi.fn(async () => undefined),
  };
});

vi.mock('../src/teamver/syncTeamverWorkspace', () => ({
  syncTeamverWorkspaceFromSession: vi.fn(async (session) => {
    const workspaces = session?.workspaces ?? [];
    const id = workspaces[0]?.id?.trim();
    return id || null;
  }),
}));

vi.mock('../src/teamver/designBffClient', () => ({
  TEAMVER_BFF_REQUEST_OPTIONS: {
    skipAuthHeader: true,
    skipAuthRecovery: true,
  },
  getDesignBffClient: vi.fn(() => null),
  fetchDesignAuthSession: vi.fn(async () => ({
    authenticated: true,
    user: { userId: 'user_u1' },
    defaultWorkspaceId: 'ws1',
    workspaces: [{ id: 'ws1', name: 'Workspace 1', role: 'owner' }],
  })),
  readCachedDesignAuthSessionMeta: vi.fn(() => ({ fetchedAt: 1_000 })),
  withDesignBffCookieAuthRecovery: vi.fn((request: () => Promise<unknown>) => request()),
  invalidateDesignAuthSessionCache: vi.fn(),
}));

beforeEach(() => {
  resetTeamverProjectRegistryStateForTests();
  resolveActiveTeamverWorkspaceIdMock.mockResolvedValue('ws1');
  designBffClient.invalidateDesignAuthSessionCache();
  vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
    authenticated: true,
    user: { userId: 'user_u1' },
    defaultWorkspaceId: 'ws1',
    workspaces: [{ id: 'ws1', name: 'Workspace 1', role: 'owner' }],
  });
  vi.mocked(designBffClient.readCachedDesignAuthSessionMeta).mockReturnValue({ fetchedAt: 1_000 });
  vi.mocked(designBffClient.withDesignBffCookieAuthRecovery).mockImplementation(
    (request: () => Promise<unknown>) => request(),
  );
});

describe('Teamver project registry payload', () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);
    clearAllTeamverProjectS3PrefixCache();
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
    clearAllTeamverProjectS3PrefixCache();
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

  it('throws when registry list is unavailable instead of showing daemon projects', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);

    await expect(
      filterProjectsByTeamverRegistryIfNeeded([{ id: 'p1' }]),
    ).rejects.toThrow('teamver_project_registry_list_failed');
  });

  it('retries registry list once after cookie auth recovery on 401', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    let callCount = 0;
    const get = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new NetworkError({ status: 401, message: 'unauthorized' });
      }
      return { projects: [{ odProjectId: 'p1' }] };
    });
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: { get },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);
    vi.mocked(designBffClient.withDesignBffCookieAuthRecovery).mockImplementation(
      async (request) => {
        try {
          return await request();
        } catch (err) {
          if (err instanceof NetworkError && err.status === 401 && callCount === 1) {
            return await request();
          }
          throw err;
        }
      },
    );

    await expect(
      filterProjectsByTeamverRegistryIfNeeded([{ id: 'p1' }, { id: 'p2' }]),
    ).resolves.toEqual([{ id: 'p1' }]);
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('Teamver project registry register', () => {
  afterEach(() => {
    resetTeamverProjectRegistryStateForTests();
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
        get: vi.fn(async () => ({
          s3Prefix: 'design/ws_ws1/user_u1/proj_p1/',
        })),
      },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(
      registerTeamverProjectIfNeeded({ id: 'p1', name: 'Demo' }),
    ).resolves.toBeUndefined();
  });

  it('skips registry upsert for daemon collection route slugs', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const post = vi.fn();
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: { post },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(
      registerTeamverProjectIfNeeded({ id: 'recent', name: '' }),
    ).resolves.toBeUndefined();
    await expect(
      registerTeamverProjectIfNeeded({ id: 'cover-hints', name: '' }),
    ).resolves.toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects embed registration when the BFF client is unavailable', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);

    await expect(
      registerTeamverProjectIfNeeded({ id: 'p1', name: 'Demo' }),
    ).rejects.toThrow('teamver_project_registry_unavailable');
  });

  it('bootstraps workspace from session when local store is empty', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const post = vi.fn(async () => ({
      odProjectId: 'p1',
      s3Prefix: 'design/ws-boot/user_u1/proj_p1/',
    }));
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: true,
      user: { userId: 'user_boot' },
      workspaces: [{ id: 'ws-boot', name: 'Boot WS', role: 'owner' }],
    });
    resolveActiveTeamverWorkspaceIdMock.mockResolvedValue('ws-boot');
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: {
        get: vi.fn(async () => null),
      },
      http: { post },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(
      registerTeamverProjectIfNeeded({ id: 'p1', name: 'Demo' }),
    ).resolves.toBeUndefined();

    expect(post).toHaveBeenCalledWith(
      '/projects',
      { odProjectId: 'p1', title: 'Demo' },
      expect.objectContaining({ workspaceId: 'ws-boot' }),
    );
    expect(readTeamverProjectS3Prefix('ws-boot', 'p1')).toBe(
      'design/ws-boot/user_u1/proj_p1/',
    );
  });

  it('rejects embed registration when registry upsert fails', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const post = vi.fn(async () => {
      throw new NetworkError({ message: 'upstream', status: 502 });
    });
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: { post },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(
      registerTeamverProjectIfNeeded({ id: 'p1', name: 'Demo' }, { retryDelaysMs: [0, 0] }),
    ).rejects.toThrow('teamver_project_registry_sync_failed');
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('retries transient registry upsert failures before surfacing create rollback errors', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const post = vi
      .fn()
      .mockRejectedValueOnce(new NetworkError({ message: 'bad gateway', status: 502 }))
      .mockResolvedValueOnce({
        odProjectId: 'p1',
        s3Prefix: 'design/ws1/user_u1/proj_p1/',
      });
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: { post },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(
      registerTeamverProjectIfNeeded({ id: 'p1', name: 'Demo' }, { retryDelaysMs: [0] }),
    ).resolves.toBeUndefined();

    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith(
      '/projects',
      { odProjectId: 'p1', title: 'Demo' },
      expect.objectContaining({ workspaceId: 'ws1' }),
    );
  });

  it('primes FE access cache after successful registry upsert so create→navigate does not wait on list', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const get = vi.fn(async () => ({ projects: [] }));
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: {
        post: vi.fn(async () => ({
          odProjectId: 'fresh-1',
          s3Prefix: 'design/ws1/user_u1/proj_fresh-1/',
        })),
        get,
      },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await registerTeamverProjectIfNeeded({ id: 'fresh-1', name: 'Fresh' }, { skipBootWait: true });

    await expect(assertTeamverProjectAccessIfNeeded('fresh-1')).resolves.toBe(true);
    expect(get).not.toHaveBeenCalled();
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
      return { s3Prefix: 'design/ws_ws1/user_u1/proj_legacy-1/' };
    });
    const get = vi.fn(async (path: string) => {
      if (path === '/projects/legacy-1') {
        return { s3Prefix: 'design/ws_ws1/user_u1/proj_legacy-1/' };
      }
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

  it('denies access for daemon collection route slugs', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const get = vi.fn();
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: { get, post: vi.fn() },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(assertTeamverProjectAccessIfNeeded('recent')).resolves.toBe(false);
    await expect(assertTeamverProjectAccessIfNeeded('cover-hints')).resolves.toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it('ensureTeamverProjectRegisteredById upserts from daemon list', async () => {
    vi.stubEnv('VITE_TEAMVER_LEGACY_REGISTRY_SYNC', '1');
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const post = vi.fn(async () => ({
      s3Prefix: 'design/ws_ws1/user_u1/proj_od-legacy/',
    }));
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

  it('listTeamverRegisteredProjectIds primes s3 prefix cache from BFF list', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: {
        get: vi.fn(async () => ({
          projects: [
            {
              odProjectId: 'od-list-1',
              s3Prefix: 'design/ws1/user_u1/proj_od-list-1/',
            },
          ],
        })),
      },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(listTeamverRegisteredProjectIds()).resolves.toEqual(new Set(['od-list-1']));
    expect(readTeamverProjectS3Prefix('ws1', 'od-list-1')).toBe(
      'design/ws1/user_u1/proj_od-list-1/',
    );
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

  it('allows access when the registry list is stale but direct project lookup succeeds', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    const get = vi.fn(async (path: string) => {
      if (path === '/projects') return { projects: [] };
      if (path === '/projects/p1-direct') {
        return {
          odProjectId: 'p1-direct',
          s3Prefix: 'design/ws1/user_u1/proj_p1-direct/',
        };
      }
      return null;
    });
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: { get, post: vi.fn() },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ projects: [] })));

    await expect(assertTeamverProjectAccessIfNeeded('p1-direct')).resolves.toBe(true);
    expect(get).toHaveBeenCalledWith('/projects', expect.objectContaining({ workspaceId: 'ws1' }));
    expect(get).toHaveBeenCalledWith(
      '/projects/p1-direct',
      expect.objectContaining({ workspaceId: 'ws1' }),
    );
    expect(readTeamverProjectS3Prefix('ws1', 'p1-direct')).toBe(
      'design/ws1/user_u1/proj_p1-direct/',
    );
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
    const post = vi.fn(async () => ({
      odProjectId: 'od-boot-1',
      s3Prefix: 'design/ws1/user_u1/proj_od-boot-1/',
    }));
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
    clearAllTeamverProjectS3PrefixCache();
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
      ...designBffClient.TEAMVER_BFF_REQUEST_OPTIONS,
    });
  });
});

describe('formatTeamverProjectRegistryErrorMessage', () => {
  it('maps registry error codes to Korean user messages', () => {
    expect(formatTeamverProjectRegistryErrorMessage('teamver_project_registry_sync_failed')).toContain(
      '등록',
    );
    expect(formatTeamverProjectRegistryErrorMessage('unknown_code', 'fallback')).toBe('fallback');
  });

  it('exposes code on TeamverProjectRegistryError', () => {
    const err = new TeamverProjectRegistryError('teamver_workspace_required');
    expect(err.code).toBe('teamver_workspace_required');
    expect(formatTeamverProjectRegistryErrorMessage(err.code)).toContain('워크스페이스');
  });
});

describe('formatTeamverProjectAccessDeniedMessage', () => {
  it('returns a Korean access-denied message', () => {
    expect(formatTeamverProjectAccessDeniedMessage()).toContain('접근');
  });
});

describe('formatTeamverProjectNotFoundMessage', () => {
  it('returns a Korean not-found message', () => {
    expect(formatTeamverProjectNotFoundMessage()).toContain('찾을 수 없');
  });
});
