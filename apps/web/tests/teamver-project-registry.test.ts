import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertTeamverProjectAccessIfNeeded,
  buildTeamverProjectRegistryPayload,
  filterProjectsByTeamverRegistryIfNeeded,
  listTeamverRegisteredProjectIds,
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

  it('accepts snake_case od_project_id from design-api JSON', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: {
        get: vi.fn(async () => ({
          projects: [{ od_project_id: 'p9' }],
        })),
      },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(
      filterProjectsByTeamverRegistryIfNeeded([{ id: 'p9' }, { id: 'p0' }]),
    ).resolves.toEqual([{ id: 'p9' }]);
  });
});

describe('Teamver project registry access', () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);
  });

  it('allows access outside embed mode', async () => {
    await expect(assertTeamverProjectAccessIfNeeded('p1')).resolves.toBe(true);
  });

  it('returns false on 403 from design-api', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: {
        get: vi.fn(async () => {
          throw new NetworkError({ message: 'forbidden', status: 403 });
        }),
      },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(assertTeamverProjectAccessIfNeeded('p1')).resolves.toBe(false);
  });

  it('returns true on transient errors (fail-open)', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
      http: {
        get: vi.fn(async () => {
          throw new NetworkError({ message: 'upstream', status: 502 });
        }),
      },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(assertTeamverProjectAccessIfNeeded('p1')).resolves.toBe(true);
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
