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
  invalidateTeamverProjectPreviewPrefix,
  peekTeamverProjectPreviewPrefix,
  projectScopedPreviewUrl,
  resetTeamverProjectPreviewScopeForTests,
  resolveTeamverProjectPreviewPrefix,
  sanitizePreviewEntryFile,
} from '../../src/teamver/teamverProjectPreviewScope';

describe('teamverProjectPreviewScope', () => {
  afterEach(() => {
    resetTeamverProjectPreviewScopeForTests();
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(fetchTeamverDaemon).mockReset();
  });

  it('strips cache-bust query from entry file before minting', async () => {
    expect(sanitizePreviewEntryFile('deck.html?v=1785228266675')).toBe('deck.html');
    expect(sanitizePreviewEntryFile('slides/a.html#x')).toBe('slides/a.html');

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

    await resolveTeamverProjectPreviewPrefix('proj-1', 'deck.html?v=1785228266675');
    expect(fetchTeamverDaemon).toHaveBeenCalledWith(
      '/api/projects/proj-1/preview-url?file=deck.html',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
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
    expect(fetchTeamverDaemon).toHaveBeenCalledWith(
      '/api/projects/proj-1/preview-url?file=deck.html',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    vi.mocked(fetchTeamverDaemon).mockClear();
    const cached = await resolveTeamverProjectPreviewPrefix('proj-1', 'other.html');
    expect(cached).toBe(prefix);
    expect(fetchTeamverDaemon).not.toHaveBeenCalled();
    expect(peekTeamverProjectPreviewPrefix('proj-1')).toBe(prefix);
  });

  it('peek returns null when cache is cold or outside embed', () => {
    expect(peekTeamverProjectPreviewPrefix('proj-missing')).toBeNull();
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
    expect(peekTeamverProjectPreviewPrefix('proj-1')).toBeNull();
  });

  it('invalidates cached prefixes so auth recovery can re-mint scopes', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(fetchTeamverDaemon)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: '/api/projects/proj-1/preview/scope-old/deck.html',
            file: 'deck.html',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: '/api/projects/proj-1/preview/scope-new/deck.html',
            file: 'deck.html',
          }),
          { status: 200 },
        ),
      );

    expect(await resolveTeamverProjectPreviewPrefix('proj-1', 'deck.html')).toBe(
      '/api/projects/proj-1/preview/scope-old',
    );
    invalidateTeamverProjectPreviewPrefix('proj-1');
    expect(await resolveTeamverProjectPreviewPrefix('proj-1', 'deck.html')).toBe(
      '/api/projects/proj-1/preview/scope-new',
    );
    expect(fetchTeamverDaemon).toHaveBeenCalledTimes(2);
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

  it('returns null when the caller aborts without canceling shared inflight', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    let resolveFetch!: (value: Response) => void;
    vi.mocked(fetchTeamverDaemon).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const abort = new AbortController();
    const aborted = resolveTeamverProjectPreviewPrefix('proj-1', 'deck.html', {
      signal: abort.signal,
    });
    const kept = resolveTeamverProjectPreviewPrefix('proj-1', 'deck.html');
    abort.abort();
    await expect(aborted).resolves.toBeNull();

    resolveFetch(
      new Response(
        JSON.stringify({
          url: '/api/projects/proj-1/preview/scope-abc/deck.html',
          file: 'deck.html',
        }),
        { status: 200 },
      ),
    );
    await expect(kept).resolves.toBe('/api/projects/proj-1/preview/scope-abc');
  });
});
