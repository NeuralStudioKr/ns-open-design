import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchProjectFilePresignedGet } from '../../src/utils/projectFilePresign';

const fetchDaemon = vi.fn();
const waitForPrefix = vi.fn().mockResolvedValue('design/ws/proj/');

afterEach(() => {
  fetchDaemon.mockReset();
  waitForPrefix.mockClear();
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

  it('returns unavailable on transient HTTP failure', async () => {
    fetchDaemon.mockResolvedValue({ ok: false, status: 502 });
    await expect(
      fetchProjectFilePresignedGet('p1', 'drawing.png', { fetchDaemon, waitForPrefix }),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'http_502' });
  });
});
