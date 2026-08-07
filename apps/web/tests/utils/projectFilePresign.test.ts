import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeProjectFilePath, projectFilePathToNfd } from '../../src/utils/projectFilePaths';

import {
  fetchProjectFilePresignedGet,
  resetProjectFilePresignInflightForTests,
} from '../../src/utils/projectFilePresign';
import {
  markProjectRawFileMissing,
  resetProjectRawFileFetchCacheForTests,
} from '../../src/utils/projectFileFetchCache';

const fetchDaemon = vi.fn();
const waitForPrefix = vi.fn().mockResolvedValue('design/ws/proj/');

afterEach(() => {
  fetchDaemon.mockReset();
  waitForPrefix.mockClear();
  resetProjectFilePresignInflightForTests();
  resetProjectRawFileFetchCacheForTests();
});

describe('fetchProjectFilePresignedGet', () => {
  it('returns a ready mint from the daemon', async () => {
    fetchDaemon.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ready',
        path: 'drawing.png',
        url: 'https://bucket.s3.amazonaws.com/design/ws/proj/drawing.png?X-Amz-Signature=abc',
        expiresInSec: 120,
        expiresAt: '2026-08-05T06:02:00.000Z',
        rawUrl: '/api/projects/p1/raw/drawing.png',
      }),
    });

    await expect(
      fetchProjectFilePresignedGet('p1', 'drawing.png', { fetchDaemon, waitForPrefix }),
    ).resolves.toMatchObject({
      kind: 'ready',
      mint: expect.objectContaining({
        url: expect.stringContaining('X-Amz-Signature='),
      }),
    });
    expect(fetchDaemon).toHaveBeenCalledWith(
      '/api/projects/p1/presign-get',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: 'drawing.png' }),
        teamverProjectId: 'p1',
      }),
    );
  });

  it('returns unavailable when daemon reports disabled (raw fallback ok)', async () => {
    fetchDaemon.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'disabled',
        path: 'drawing.png',
        rawUrl: '/api/projects/p1/raw/drawing.png',
        reason: 'local_storage',
      }),
    });
    await expect(
      fetchProjectFilePresignedGet('p1', 'drawing.png', { fetchDaemon, waitForPrefix }),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'local_storage' });
  });

  it('returns missing on HTTP 404 so callers skip /raw/ double-fetch', async () => {
    fetchDaemon.mockResolvedValue({ ok: false, status: 404 });
    await expect(
      fetchProjectFilePresignedGet('p1', 'missing.png', { fetchDaemon, waitForPrefix }),
    ).resolves.toEqual({ kind: 'missing' });
  });

  it('falls back to NFD candidate on 404 for Hangul NFC path', async () => {
    const nfc = 'msilvcf5-' + '다운로드'.normalize('NFC') + '.jpeg';
    const nfd = projectFilePathToNfd(nfc);
    expect(nfd).not.toBe(nfc);
    expect(normalizeProjectFilePath(nfd)).toBe(nfc);
    fetchDaemon
      // NFC probe misses
      .mockResolvedValueOnce({ ok: false, status: 404 })
      // NFD probe hits
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ready',
          path: nfd,
          url: `https://bucket/${encodeURIComponent(nfd)}?sig`,
          expiresInSec: 60,
          expiresAt: '2026-08-05T06:02:00.000Z',
          rawUrl: `/api/projects/p1/raw/${nfd}`,
        }),
      });
    const result = await fetchProjectFilePresignedGet('p1', nfc, { fetchDaemon, waitForPrefix });
    expect(result).toMatchObject({ kind: 'ready' });
    expect(fetchDaemon).toHaveBeenCalledTimes(2);
    const bodies = fetchDaemon.mock.calls.map((call) => JSON.parse(String((call[1] as any)?.body ?? '{}')));
    expect(bodies).toEqual([
      { path: nfc },
      { path: nfd },
    ]);
  });

  it('skips network when the session missing cache already knows the path', async () => {
    markProjectRawFileMissing('p1', 'gone-drawing.png');
    await expect(
      fetchProjectFilePresignedGet('p1', 'gone-drawing.png', { fetchDaemon, waitForPrefix }),
    ).resolves.toEqual({ kind: 'missing' });
    expect(fetchDaemon).not.toHaveBeenCalled();
  });

  it('coalesces concurrent mint requests for the same path', async () => {
    let resolveFetch: ((value: unknown) => void) | null = null;
    fetchDaemon.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const a = fetchProjectFilePresignedGet('p1', 'drawing.png', { fetchDaemon, waitForPrefix });
    const b = fetchProjectFilePresignedGet('p1', 'drawing.png', { fetchDaemon, waitForPrefix });
    await vi.waitFor(() => {
      expect(fetchDaemon).toHaveBeenCalledTimes(1);
      expect(typeof resolveFetch).toBe('function');
    });
    resolveFetch!({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ready',
        path: 'drawing.png',
        url: 'https://bucket.s3.amazonaws.com/x?sig=1',
        expiresInSec: 120,
        expiresAt: '2026-08-05T06:02:00.000Z',
        rawUrl: '/api/projects/p1/raw/drawing.png',
      }),
    });
    await expect(Promise.all([a, b])).resolves.toEqual([
      expect.objectContaining({ kind: 'ready' }),
      expect.objectContaining({ kind: 'ready' }),
    ]);
    expect(fetchDaemon).toHaveBeenCalledTimes(1);
  });

  it('returns unavailable on transient HTTP failure', async () => {
    fetchDaemon.mockResolvedValue({ ok: false, status: 502 });
    await expect(
      fetchProjectFilePresignedGet('p1', 'drawing.png', { fetchDaemon, waitForPrefix }),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'http_502' });
  });
});
