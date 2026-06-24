import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readActiveTeamverWorkspaceId,
  requireActiveTeamverWorkspaceId,
  resolveActiveTeamverWorkspaceId,
} from '../src/teamver/activeTeamverWorkspace';
import * as designApiBase from '../src/teamver/designApiBase';
import * as designBffClient from '../src/teamver/designBffClient';

vi.mock('../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

vi.mock('../src/teamver/syncTeamverWorkspace', () => ({
  syncTeamverWorkspaceFromSession: vi.fn(async (session) => {
    const workspaces = session?.workspaces ?? [];
    const id = workspaces[0]?.id?.trim();
    return id || null;
  }),
}));

vi.mock('../src/teamver/designBffClient', () => ({
  getDesignBffClient: vi.fn(() => null),
  fetchDesignAuthSession: vi.fn(async () => null),
}));

describe('activeTeamverWorkspace', () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);
    vi.mocked(designBffClient.fetchDesignAuthSession).mockResolvedValue(null);
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
      workspaceStore: { get: vi.fn(async () => null) },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(resolveActiveTeamverWorkspaceId()).resolves.toBe('ws-session');
    await expect(readActiveTeamverWorkspaceId()).resolves.toBe('ws-session');
  });

  it('throws teamver_workspace_required when unresolved', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => null) },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await expect(requireActiveTeamverWorkspaceId()).rejects.toThrow('teamver_workspace_required');
  });
});
