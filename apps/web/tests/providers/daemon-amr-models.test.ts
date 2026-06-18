import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

import { fetchAmrModels, fetchVelaLoginStatus } from '../../src/providers/daemon';
import { isTeamverEmbedMode } from '../../src/teamver/designApiBase';

describe('fetchAmrModels', () => {
  beforeEach(() => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns AMR model cache payloads from the daemon', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        source: 'preset',
        models: [{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }],
        refreshing: true,
      }), { status: 200 })),
    );

    await expect(fetchAmrModels()).resolves.toEqual({
      source: 'preset',
      models: [{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }],
      refreshing: true,
    });
    expect(fetch).toHaveBeenCalledWith('/api/amr/models', { cache: 'no-store' });
  });

  it('returns null when the daemon does not return AMR models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    await expect(fetchAmrModels()).resolves.toBeNull();
  });

  it('skips AMR model polling in Teamver embed mode', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAmrModels()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips Vela login status polling in Teamver embed mode', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchVelaLoginStatus()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
