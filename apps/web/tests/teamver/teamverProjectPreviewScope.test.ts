import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

vi.mock('../../src/teamver/teamverDaemonHeaders', () => ({
  fetchTeamverDaemon: vi.fn(),
}));

import { isTeamverEmbedMode } from '../../src/teamver/designApiBase';
import { fetchTeamverDaemon } from '../../src/teamver/teamverDaemonHeaders';
import {
  projectScopedPreviewUrl,
  resetTeamverProjectPreviewScopeForTests,
  resolveTeamverProjectPreviewPrefix,
} from '../../src/teamver/teamverProjectPreviewScope';

describe('teamverProjectPreviewScope', () => {
  afterEach(() => {
    resetTeamverProjectPreviewScopeForTests();
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(fetchTeamverDaemon).mockReset();
  });

  it('returns null outside embed mode', async () => {
    expect(await resolveTeamverProjectPreviewPrefix('proj-1', 'deck.html')).toBeNull();
    expect(fetchTeamverDaemon).not.toHaveBeenCalled();
  });

  it('mints and caches a preview scope prefix in embed mode', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(
      new Response(
        JSON.stringify({
          url: '/api/projects/proj-1/preview/scope-abc/deck.html',
          file: 'deck.html',
        }),
        { status: 200 },
      ),
    );

    const prefix = await resolveTeamverProjectPreviewPrefix('proj-1', 'deck.html');
    expect(prefix).toBe('/api/projects/proj-1/preview/scope-abc');
    expect(fetchTeamverDaemon).toHaveBeenCalledWith('/api/projects/proj-1/preview-url?file=deck.html');

    vi.mocked(fetchTeamverDaemon).mockClear();
    const cached = await resolveTeamverProjectPreviewPrefix('proj-1', 'other.html');
    expect(cached).toBe(prefix);
    expect(fetchTeamverDaemon).not.toHaveBeenCalled();
  });

  it('treats malformed preview-url responses as unavailable without throwing', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(
      new Response(JSON.stringify({ file: 'deck.html' }), { status: 200 }),
    );

    await expect(resolveTeamverProjectPreviewPrefix('proj-1', 'deck.html')).resolves.toBeNull();
  });

  it('treats non-json preview-url responses as unavailable without throwing', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(
      new Response('<!doctype html><html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    await expect(resolveTeamverProjectPreviewPrefix('proj-1', 'deck.html')).resolves.toBeNull();
  });

  it('treats preview-url fetch failures as unavailable without throwing', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(fetchTeamverDaemon).mockRejectedValue(new TypeError('network failed'));

    await expect(resolveTeamverProjectPreviewPrefix('proj-1', 'deck.html')).resolves.toBeNull();
  });

  it('builds scoped asset URLs from the minted prefix', () => {
    const url = projectScopedPreviewUrl('/api/projects/p1/preview/s1', 'assets/logo.png');
    expect(url).toBe('/api/projects/p1/preview/s1/assets/logo.png');
  });
});
