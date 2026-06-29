// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

import { isTeamverEmbedMode } from '../../src/teamver/designApiBase';
import { useDiscordPresence } from '../../src/components/useDiscordPresence';

const originalFetch = globalThis.fetch;

describe('useDiscordPresence', () => {
  beforeEach(() => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
    globalThis.fetch = vi.fn();
    window.localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('skips fetch in Teamver embed mode', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);

    renderHook(() => useDiscordPresence());

    await waitFor(() => {
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  it('skips fetch when enabled is false', async () => {
    renderHook(() => useDiscordPresence({ enabled: false }));

    await waitFor(() => {
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  it('fetches when enabled and not embed', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ onlineCount: 42, memberCount: 100 }),
    } as Response);

    renderHook(() => useDiscordPresence());

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/community/discord');
    });
  });
});
