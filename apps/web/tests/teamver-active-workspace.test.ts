// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readActiveTeamverWorkspaceId,
  requireActiveTeamverWorkspaceId,
  resolveActiveTeamverWorkspaceId,
} from '../src/teamver/activeTeamverWorkspace';
import * as designApiBase from '../src/teamver/designApiBase';
import * as designBffClient from '../src/teamver/designBffClient';
import { bumpTeamverWorkspaceStoreRevision } from '../src/teamver/teamverWorkspaceStoreRevision';

const storeGetMock = vi.fn(async () => null as string | null);

vi.mock('../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

vi.mock('../src/teamver/syncTeamverWorkspace', () => ({
  syncTeamverWorkspaceFromSession: vi.fn(async (session) => {
    const defaultId = (session?.defaultWorkspaceId ?? '').trim();
    if (defaultId) return defaultId;
    const workspaces = session?.workspaces ?? [];
    const id = workspaces[0]?.id?.trim();
    return id || null;
  }),
}));

vi.mock('../src/teamver/designBffClient', () => ({
  getDesignBffClient: vi.fn(() => null),
  fetchDesignAuthSession: vi.fn(async () => null),
  readCachedDesignAuthSessionMeta: vi.fn(() => null),
}));

describe('activeTeamverWorkspace', () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue(null);
    vi.mocked(designBffClient.readCachedDesignAuthSessionMeta).mockReturnValue(null);
    storeGetMock.mockReset();
    storeGetMock.mockResolvedValue(null);
    localStorage.clear();
  });

  it('returns null outside embed mode for readActiveTeamverWorkspaceId', async () => {
    await expect(readActiveTeamverWorkspaceId()).resolves.toBeNull();
  });

  it('bootstraps workspace from session when store is empty', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: true,
      workspaces: [{ id: 'ws-session', name: 'Session WS', role: 'owner' }],
    });
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: storeGetMock },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe('ws-session');
    await expect(readActiveTeamverWorkspaceId()).resolves.toBe('ws-session');
  });

  it('reconciles stale store when session default is newer (parent switch)', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    storeGetMock.mockResolvedValue('ws-old');
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: true,
      defaultWorkspaceId: 'ws-new',
      workspaces: [
        { id: 'ws-old', name: 'Old', role: 'owner' },
        { id: 'ws-new', name: 'New', role: 'owner' },
      ],
    });
    vi.mocked(designBffClient.readCachedDesignAuthSessionMeta).mockReturnValue({
      fetchedAt: 2_000,
      defaultWorkspaceId: 'ws-new',
    });
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: storeGetMock },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe('ws-new');
  });

  it('keeps embed picker store when revision is newer than session snapshot', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    storeGetMock.mockResolvedValue('ws-picked');
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: true,
      defaultWorkspaceId: 'ws-default',
      workspaces: [
        { id: 'ws-picked', name: 'Picked', role: 'owner' },
        { id: 'ws-default', name: 'Default', role: 'owner' },
      ],
    });
    vi.mocked(designBffClient.readCachedDesignAuthSessionMeta).mockReturnValue({
      fetchedAt: 1_000,
      defaultWorkspaceId: 'ws-default',
    });
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: storeGetMock },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);
    bumpTeamverWorkspaceStoreRevision();

    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe('ws-picked');
  });

  it('throws teamver_workspace_required when unresolved', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: storeGetMock },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(requireActiveTeamverWorkspaceId()).rejects.toThrow('teamver_workspace_required');
  });
});
