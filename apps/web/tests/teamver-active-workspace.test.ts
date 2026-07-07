// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readActiveTeamverWorkspaceId,
  requireActiveTeamverWorkspaceId,
  resolveActiveTeamverWorkspaceId,
} from '../src/teamver/activeTeamverWorkspace';
import * as designApiBase from '../src/teamver/designApiBase';
import * as designBffClient from '../src/teamver/designBffClient';
import { syncTeamverWorkspaceFromSession } from '../src/teamver/syncTeamverWorkspace';

const storeGetMock = vi.fn(async () => null as string | null);

vi.mock('../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

vi.mock('../src/teamver/syncTeamverWorkspace', () => ({
  syncTeamverWorkspaceFromSession: vi.fn(async (session, workspaces, options) => {
    const override = options?.preferredIdOverride?.trim();
    if (override) return override;
    const defaultId = (session?.defaultWorkspaceId ?? '').trim();
    if (defaultId) return defaultId;
    const list = workspaces ?? session?.workspaces ?? [];
    return list[0]?.id?.trim() || null;
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
    vi.mocked(syncTeamverWorkspaceFromSession).mockClear();
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
    expect(vi.mocked(syncTeamverWorkspaceFromSession)).toHaveBeenCalled();
  });

  it('keeps the embed store when it still exists on the session list', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    storeGetMock.mockResolvedValue('ws-active');
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: true,
      defaultWorkspaceId: 'ws-default',
      workspaces: [
        { id: 'ws-active', name: 'Active', role: 'owner' },
        { id: 'ws-default', name: 'Default', role: 'owner' },
      ],
    });
    vi.mocked(designBffClient.readCachedDesignAuthSessionMeta).mockReturnValue({
      fetchedAt: 9_999,
      defaultWorkspaceId: 'ws-default',
    });
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: storeGetMock },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe('ws-active');
    expect(vi.mocked(syncTeamverWorkspaceFromSession)).not.toHaveBeenCalled();
  });

  it('reconciles through session sync when the stored workspace was revoked', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    storeGetMock.mockResolvedValue('ws-revoked');
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: true,
      defaultWorkspaceId: 'ws-current',
      workspaces: [{ id: 'ws-current', name: 'Current', role: 'owner' }],
    });
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: storeGetMock },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe('ws-current');
    expect(vi.mocked(syncTeamverWorkspaceFromSession)).toHaveBeenCalled();
  });

  it('returns the persisted workspace when session briefly reads unauthenticated', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    storeGetMock.mockResolvedValue('ws-persisted');
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue({
      authenticated: false,
      workspaces: [],
    });
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: storeGetMock },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe('ws-persisted');
    expect(vi.mocked(syncTeamverWorkspaceFromSession)).not.toHaveBeenCalled();
  });

  it('throws teamver_workspace_required when unresolved', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: storeGetMock },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(requireActiveTeamverWorkspaceId()).rejects.toThrow('teamver_workspace_required');
  });
});
