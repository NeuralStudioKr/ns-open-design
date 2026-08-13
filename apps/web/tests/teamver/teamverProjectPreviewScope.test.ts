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
  warmTeamverProjectPreviewPrefixes,
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

  it('drops workspace sentinel tab ids so Design Files cannot mint FILE_NOT_FOUND', async () => {
    expect(sanitizePreviewEntryFile('__design_files__')).toBeUndefined();
    expect(sanitizePreviewEntryFile('__design_system__')).toBeUndefined();
    expect(sanitizePreviewEntryFile('__questions__')).toBeUndefined();

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

    await resolveTeamverProjectPreviewPrefix('proj-1', '__design_files__');
    expect(fetchTeamverDaemon).toHaveBeenCalledWith(
      '/api/projects/proj-1/preview-url',
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

  it('drops in-flight mint seeds after invalidate so stale scopes cannot re-poison cache', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    let releaseStale: ((value: Response) => void) | null = null;
    const staleResponse = new Promise<Response>((resolve) => {
      releaseStale = resolve;
    });
    vi.mocked(fetchTeamverDaemon)
      .mockImplementationOnce(() => staleResponse)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: '/api/projects/proj-1/preview/scope-fresh/deck.html',
            file: 'deck.html',
          }),
          { status: 200 },
        ),
      );

    const staleWaiter = resolveTeamverProjectPreviewPrefix('proj-1', 'deck.html');
    // Allow the first mint to register inflight before invalidate.
    await Promise.resolve();
    invalidateTeamverProjectPreviewPrefix('proj-1');
    const fresh = await resolveTeamverProjectPreviewPrefix('proj-1', 'deck.html');
    expect(fresh).toBe('/api/projects/proj-1/preview/scope-fresh');

    releaseStale?.(
      new Response(
        JSON.stringify({
          url: '/api/projects/proj-1/preview/scope-stale/deck.html',
          file: 'deck.html',
        }),
        { status: 200 },
      ),
    );
    await expect(staleWaiter).resolves.toBeNull();
    expect(peekTeamverProjectPreviewPrefix('proj-1')).toBe(
      '/api/projects/proj-1/preview/scope-fresh',
    );
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

  it('percent-encodes Korean / special path segments for scoped preview URLs', () => {
    const url = projectScopedPreviewUrl(
      '/api/projects/p1/preview/s1',
      'refs/drive/msh5lhfh-놀란고양이-_1_.jpeg',
    );
    expect(url).toBe(
      '/api/projects/p1/preview/s1/refs/drive/msh5lhfh-%EB%86%80%EB%9E%80%EA%B3%A0%EC%96%91%EC%9D%B4-_1_.jpeg',
    );
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

  it('coalesces concurrent mints for the same project across different files (0806-N06)', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    let resolveFetch!: (value: Response) => void;
    vi.mocked(fetchTeamverDaemon).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const a = resolveTeamverProjectPreviewPrefix('proj-1', 'deck.html');
    const b = resolveTeamverProjectPreviewPrefix('proj-1', 'slides/deck.html');
    expect(fetchTeamverDaemon).toHaveBeenCalledTimes(1);

    resolveFetch(
      new Response(
        JSON.stringify({
          url: '/api/projects/proj-1/preview/scope-abc/deck.html',
          file: 'deck.html',
        }),
        { status: 200 },
      ),
    );
    await expect(a).resolves.toBe('/api/projects/proj-1/preview/scope-abc');
    await expect(b).resolves.toBe('/api/projects/proj-1/preview/scope-abc');
  });

  it('warms multiple prefixes with one preview-url-batch POST (0806-N06)', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              projectId: 'p1',
              ok: true,
              url: '/api/projects/p1/preview/s1/deck.html',
              file: 'deck.html',
            },
            {
              projectId: 'p2',
              ok: true,
              url: '/api/projects/p2/preview/s2/deck.html',
              file: 'deck.html',
            },
            { projectId: 'p3', ok: false },
          ],
        }),
        { status: 200 },
      ),
    );

    await warmTeamverProjectPreviewPrefixes([
      { projectId: 'p1', file: 'deck.html' },
      { projectId: 'p2', file: 'deck.html?v=1' },
      { projectId: 'p3', file: 'deck.html' },
    ]);

    expect(fetchTeamverDaemon).toHaveBeenCalledWith(
      '/api/projects/preview-url-batch',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          items: [
            { projectId: 'p1', file: 'deck.html' },
            { projectId: 'p2', file: 'deck.html' },
            { projectId: 'p3', file: 'deck.html' },
          ],
        }),
      }),
    );
    expect(peekTeamverProjectPreviewPrefix('p1')).toBe('/api/projects/p1/preview/s1');
    expect(peekTeamverProjectPreviewPrefix('p2')).toBe('/api/projects/p2/preview/s2');
    expect(peekTeamverProjectPreviewPrefix('p3')).toBeNull();

    vi.mocked(fetchTeamverDaemon).mockClear();
    await expect(resolveTeamverProjectPreviewPrefix('p1', 'deck.html')).resolves.toBe(
      '/api/projects/p1/preview/s1',
    );
    expect(fetchTeamverDaemon).not.toHaveBeenCalled();
  });

  it('coalesces parallel warmTeamverProjectPreviewPrefixes into one POST', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    let resolveBatch!: (value: Response) => void;
    vi.mocked(fetchTeamverDaemon).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveBatch = resolve;
        }),
    );

    const first = warmTeamverProjectPreviewPrefixes([{ projectId: 'a', file: 'a.html' }]);
    const second = warmTeamverProjectPreviewPrefixes([{ projectId: 'b', file: 'b.html' }]);
    for (let i = 0; i < 20 && vi.mocked(fetchTeamverDaemon).mock.calls.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(fetchTeamverDaemon).toHaveBeenCalledTimes(1);
    resolveBatch(
      new Response(
        JSON.stringify({
          results: [
            { projectId: 'a', ok: true, url: '/api/projects/a/preview/s/a.html', file: 'a.html' },
            { projectId: 'b', ok: true, url: '/api/projects/b/preview/s/b.html', file: 'b.html' },
          ],
        }),
        { status: 200 },
      ),
    );
    await Promise.all([first, second]);
    expect(peekTeamverProjectPreviewPrefix('a')).toBe('/api/projects/a/preview/s');
    expect(peekTeamverProjectPreviewPrefix('b')).toBe('/api/projects/b/preview/s');
  });
});
