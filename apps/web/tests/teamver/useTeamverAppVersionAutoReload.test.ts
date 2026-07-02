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

type VersionPayload = { version: { version: string } };

function makeFetchMock(versions: string[]) {
  let i = 0;
  return vi.fn(async () => {
    const v = versions[Math.min(i, versions.length - 1)];
    i += 1;
    return new Response(JSON.stringify({ version: { version: v } } satisfies VersionPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
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

  it('records the first version as baseline and does not reload on first observation', async () => {
    const fetchMock = makeFetchMock(['1.0.0']);
    vi.stubGlobal('fetch', fetchMock);
    const reload = vi.fn();

    renderHook(() =>
      useTeamverAppVersionAutoReload({ pollIntervalMs: 1000, reloadDelayMs: 10, reload }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // No mismatch yet -> no reload scheduled even after the delay.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it('triggers an auto-reload when the daemon reports a new version', async () => {
    const fetchMock = makeFetchMock(['1.0.0', '1.1.0']);
    vi.stubGlobal('fetch', fetchMock);
    const reload = vi.fn();

    renderHook(() =>
      useTeamverAppVersionAutoReload({ pollIntervalMs: 1000, reloadDelayMs: 50, reload }),
    );

    // First poll establishes baseline.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance to the next poll -> mismatch detected, reload scheduled.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled(); // delayed

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('skips polling when the tab is hidden and resumes after visibility returns', async () => {
    const fetchMock = makeFetchMock(['1.0.0', '1.0.0', '2.0.0']);
    vi.stubGlobal('fetch', fetchMock);
    const reload = vi.fn();

    const visibilityDescriptor = {
      get: vi.fn(() => 'hidden' as DocumentVisibilityState),
      configurable: true,
    };
    Object.defineProperty(document, 'visibilityState', visibilityDescriptor);

    renderHook(() =>
      useTeamverAppVersionAutoReload({ pollIntervalMs: 500, reloadDelayMs: 10, reload }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Mount checkVersion bailed out on hidden -> baseline not yet captured.
    expect(fetchMock).not.toHaveBeenCalled();

    // Advance through the interval while still hidden -> still no fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // Become visible and dispatch the visibilitychange event. The listener
    // fires checkVersion which captures the baseline; an additional tick
    // through pending microtasks may also surface a queued interval call,
    // so we assert ">= 1" rather than exactly 1 to keep the assertion
    // focused on the wakes-on-visibility-return behavior.
    visibilityDescriptor.get.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload twice if the daemon reports yet another version while reload is pending', async () => {
    const fetchMock = makeFetchMock(['1.0.0', '1.1.0', '1.2.0', '1.3.0']);
    vi.stubGlobal('fetch', fetchMock);
    const reload = vi.fn();

    renderHook(() =>
      useTeamverAppVersionAutoReload({ pollIntervalMs: 100, reloadDelayMs: 1000, reload }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // First mismatch -> schedules reload.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Subsequent polls should bail because reload is already scheduled.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Reload eventually fires exactly once.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('is a no-op outside embed mode', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const reload = vi.fn();

    renderHook(() =>
      useTeamverAppVersionAutoReload({ pollIntervalMs: 100, reloadDelayMs: 10, reload }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
