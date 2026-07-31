import { describe, expect, it, vi } from 'vitest';

import { loadAuthenticatedProjectFileBlob } from '../../src/hooks/useAuthenticatedProjectFileObjectUrl';

describe('loadAuthenticatedProjectFileBlob', () => {
  it('retries after a transient non-OK raw fetch and returns the image blob', async () => {
    const imageBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const fetchDaemon = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => imageBlob,
      } as Response);
    const waitForPrefix = vi.fn().mockResolvedValue('tenants/ws/projects/p1');

    const blob = await loadAuthenticatedProjectFileBlob('project-1', 'uploads/mark.png', {
      delaysMs: [0, 0],
      fetchDaemon: fetchDaemon as typeof import('../../src/teamver/teamverDaemonHeaders').fetchTeamverDaemon,
      waitForPrefix: waitForPrefix as typeof import('../../src/teamver/teamverProjectS3PrefixResolve').waitForTeamverProjectStoragePrefix,
    });

    expect(waitForPrefix).toHaveBeenCalledWith('project-1', { quick: true });
    expect(fetchDaemon).toHaveBeenCalledTimes(2);
    expect(blob).toBe(imageBlob);
  });

  it('rejects non-image 200 bodies instead of creating a broken thumbnail', async () => {
    const htmlBlob = new Blob(['<!doctype html>'], { type: 'text/html' });
    const fetchDaemon = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => htmlBlob,
    } as Response);

    const blob = await loadAuthenticatedProjectFileBlob('project-1', 'uploads/mark.png', {
      delaysMs: [0],
      fetchDaemon: fetchDaemon as typeof import('../../src/teamver/teamverDaemonHeaders').fetchTeamverDaemon,
      waitForPrefix: vi.fn().mockResolvedValue(null) as typeof import('../../src/teamver/teamverProjectS3PrefixResolve').waitForTeamverProjectStoragePrefix,
    });

    expect(blob).toBeNull();
  });

  it('accepts PNG bytes when the server returns a non-image MIME type', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const wrongMimeBlob = new Blob([pngBytes], { type: 'application/json' });
    const fetchDaemon = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => wrongMimeBlob,
    } as Response);

    const blob = await loadAuthenticatedProjectFileBlob('project-1', 'uploads/mark.png', {
      delaysMs: [0],
      trustExists: true,
      fetchDaemon: fetchDaemon as typeof import('../../src/teamver/teamverDaemonHeaders').fetchTeamverDaemon,
      waitForPrefix: vi.fn().mockResolvedValue(null) as typeof import('../../src/teamver/teamverProjectS3PrefixResolve').waitForTeamverProjectStoragePrefix,
    });

    expect(blob?.type).toBe('image/png');
  });

  it('skips ephemeral drawing screenshots unless the caller trusts they exist', async () => {
    const fetchDaemon = vi.fn();

    const blob = await loadAuthenticatedProjectFileBlob(
      'project-1',
      'ms798rzf-drawing-2026-07-30T08-31-44-563Z.png',
      {
        delaysMs: [0],
        fetchDaemon: fetchDaemon as typeof import('../../src/teamver/teamverDaemonHeaders').fetchTeamverDaemon,
        waitForPrefix: vi.fn().mockResolvedValue(null) as typeof import('../../src/teamver/teamverProjectS3PrefixResolve').waitForTeamverProjectStoragePrefix,
      },
    );

    expect(blob).toBeNull();
    expect(fetchDaemon).not.toHaveBeenCalled();
  });
});
