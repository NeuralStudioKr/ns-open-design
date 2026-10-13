import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  streamProxyEndpoint: vi.fn(),
  resolveMiniMaxChatEndpoint: vi.fn(),
}));

vi.mock('../../src/providers/api-proxy', () => ({
  streamProxyEndpoint: mocks.streamProxyEndpoint,
}));

vi.mock('../../src/teamver/hostedManagedChat', () => ({
  HOSTED_MANAGED_CHAT_ENDPOINT: '/api/proxy/chat/stream',
  LEGACY_MINIMAX_CHAT_ENDPOINT: '/api/proxy/minimax/stream',
  resolveMiniMaxChatEndpoint: mocks.resolveMiniMaxChatEndpoint,
  isHostedManagedChatRouteMissingError: (error: unknown) => (
    error instanceof Error && /^proxy\s+404:/i.test(error.message)
  ),
}));

import { streamMessageMiniMax } from '../../src/providers/minimax-compatible';

describe('streamMessageMiniMax hosted shadow routing', () => {
  beforeEach(() => {
    mocks.streamProxyEndpoint.mockReset();
    mocks.resolveMiniMaxChatEndpoint.mockReset();
  });

  it('falls back to the legacy endpoint only when the shadow route is missing', async () => {
    mocks.resolveMiniMaxChatEndpoint.mockReturnValue('/api/proxy/chat/stream');
    mocks.streamProxyEndpoint
      .mockImplementationOnce(async (...args: unknown[]) => {
        const handlers = args[5] as { onError: (error: Error) => void };
        handlers.onError(new Error('proxy 404: no body'));
      })
      .mockResolvedValueOnce(undefined);

    await streamMessageMiniMax(
      {} as any,
      'system',
      [],
      new AbortController().signal,
      { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
    );

    expect(mocks.streamProxyEndpoint).toHaveBeenCalledTimes(2);
    expect(mocks.streamProxyEndpoint.mock.calls[0]?.[0]).toBe('/api/proxy/chat/stream');
    expect(mocks.streamProxyEndpoint.mock.calls[1]?.[0]).toBe('/api/proxy/minimax/stream');
  });

  it('does not hide a real shadow API failure', async () => {
    mocks.resolveMiniMaxChatEndpoint.mockReturnValue('/api/proxy/chat/stream');
    const onError = vi.fn();
    const failure = new Error('proxy 503: unavailable');
    mocks.streamProxyEndpoint.mockImplementationOnce(async (...args: unknown[]) => {
      const handlers = args[5] as { onError: (error: Error) => void };
      handlers.onError(failure);
    });

    await streamMessageMiniMax(
      {} as any,
      'system',
      [],
      new AbortController().signal,
      { onDelta: vi.fn(), onDone: vi.fn(), onError },
    );

    expect(mocks.streamProxyEndpoint).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
