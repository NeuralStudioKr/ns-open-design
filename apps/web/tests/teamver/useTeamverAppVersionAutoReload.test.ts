// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock('../../src/teamver/teamverDaemonHeaders', () => ({
  fetchTeamverDaemon: vi.fn((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)),
}));

import { isTeamverEmbedMode } from '../../src/teamver/designApiBase';
import { resetDaemonAppVersionCacheForTests } from '../../src/teamver/daemonAppVersion';
import { useTeamverAppVersionAutoReload } from '../../src/teamver/useTeamverAppVersionAutoReload';

function makeVersionResponse(version = '1.0.0'): Response {
  return new Response(JSON.stringify({ version: { version } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useTeamverAppVersionAutoReload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
  });

  afterEach(() => {
    resetDaemonAppVersionCacheForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('primes the app-version cache once on embed mount', async () => {
    const fetchMock = vi.fn(async () => makeVersionResponse('1.0.0'));
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useTeamverAppVersionAutoReload());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60_000);
      window.dispatchEvent(new Event('pageshow'));
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is a no-op outside embed mode', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useTeamverAppVersionAutoReload());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
