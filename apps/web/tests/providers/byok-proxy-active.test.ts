import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/teamverDaemonHeaders', () => ({
  fetchTeamverDaemon: vi.fn(),
}));

vi.mock('../../src/teamver/designBffClient', () => ({
  isDesignAuthRefreshDeclined: vi.fn(() => false),
}));

vi.mock('../../src/teamver/teamverEmbedSession', () => ({
  isTeamverEmbedSessionAuthenticated: vi.fn(() => true),
}));

import { fetchTeamverDaemon } from '../../src/teamver/teamverDaemonHeaders';
import { isDesignAuthRefreshDeclined } from '../../src/teamver/designBffClient';
import { isTeamverEmbedSessionAuthenticated } from '../../src/teamver/teamverEmbedSession';
import {
  ActiveByokProxyAuthTransientError,
  listActiveByokProxyStreams,
  resetByokProxyActiveAuthBackoffForTests,
  shouldSkipByokProxyActivePoll,
} from '../../src/providers/byokProxyActive';

describe('listActiveByokProxyStreams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetByokProxyActiveAuthBackoffForTests();
    vi.mocked(isDesignAuthRefreshDeclined).mockReturnValue(false);
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
  });

  it('returns active proxy streams for the project', async () => {
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(
      new Response(JSON.stringify({
        streams: [
          {
            streamId: 'stream-1',
            projectId: 'project-1',
            conversationId: 'conv-1',
            assistantMessageId: 'msg-1',
            registeredAt: 123,
          },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(listActiveByokProxyStreams('project-1')).resolves.toEqual([
      {
        streamId: 'stream-1',
        projectId: 'project-1',
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
        registeredAt: 123,
      },
    ]);
    expect(fetchTeamverDaemon).toHaveBeenCalledWith(
      '/api/proxy/active?projectId=project-1',
      { teamverProjectId: 'project-1', skipEmbedAuthRecovery: true },
    );
  });

  it('keeps 404 compatible with daemons that do not expose the endpoint', async () => {
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(new Response('not found', { status: 404 }));

    await expect(listActiveByokProxyStreams('project-1')).resolves.toEqual([]);
  });

  it('throws a typed transient auth error for session-expired 401 and backs off', async () => {
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(
      new Response(JSON.stringify({ detail: 'session_expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(listActiveByokProxyStreams('project-1')).rejects.toBeInstanceOf(
      ActiveByokProxyAuthTransientError,
    );
    expect(shouldSkipByokProxyActivePoll()).toBe(true);
    await expect(listActiveByokProxyStreams('project-1')).rejects.toBeInstanceOf(
      ActiveByokProxyAuthTransientError,
    );
    expect(fetchTeamverDaemon).toHaveBeenCalledTimes(1);
  });

  it('skips the network call while soft-sticky decline owns recovery', async () => {
    vi.mocked(isDesignAuthRefreshDeclined).mockReturnValue(true);

    await expect(listActiveByokProxyStreams('project-1')).rejects.toBeInstanceOf(
      ActiveByokProxyAuthTransientError,
    );
    expect(fetchTeamverDaemon).not.toHaveBeenCalled();
  });

  it('throws on transient failures so recovery callers do not treat them as drained', async () => {
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad gateway' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(listActiveByokProxyStreams('project-1')).rejects.toThrow(
      'active_byok_proxy_streams_failed:502',
    );
  });

  it('throws network failures instead of returning an empty active stream list', async () => {
    vi.mocked(fetchTeamverDaemon).mockRejectedValue(new TypeError('network down'));

    await expect(listActiveByokProxyStreams('project-1')).rejects.toThrow('network down');
  });
});
