import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alternateAuthenticatedRawPaths,
  loadAuthenticatedProjectFileBlob,
  resetInflightProjectFileBlobLoadsForTests,
} from '../../src/hooks/useAuthenticatedProjectFileObjectUrl';
import {
  isProjectRawFileKnownMissing,
  markProjectRawFileMissing,
  resetProjectRawFileFetchCacheForTests,
} from '../../src/utils/projectFileFetchCache';

describe('alternateAuthenticatedRawPaths', () => {
  it('probes refs/drive for basename-only recovered mention paths', () => {
    expect(alternateAuthenticatedRawPaths('msh9rso1-서빙하는-금붕어.webp')).toEqual(
      expect.arrayContaining([
        'refs/drive/msh9rso1-서빙하는-금붕어.webp',
        'uploads/msh9rso1-서빙하는-금붕어.webp',
        'assets/msh9rso1-서빙하는-금붕어.webp',
      ]),
    );
  });

  it('probes NFC form when Drive path is Hangul NFD', () => {
    const nfdName = '금붕어'.normalize('NFD');
    const nfcName = '금붕어'.normalize('NFC');
    expect(nfdName).not.toBe(nfcName);
    const nfdPath = `refs/drive/msh9rso1-${nfdName}.webp`;
    expect(alternateAuthenticatedRawPaths(nfdPath)).toEqual(
      expect.arrayContaining([
        `refs/drive/msh9rso1-${nfcName}.webp`,
        `msh9rso1-${nfcName}.webp`,
        `uploads/msh9rso1-${nfcName}.webp`,
      ]),
    );
  });

  it('probes NFD form when caller provides an NFC Hangul basename', () => {
    const nfc = 'msh9rso1-서빙하는-금붕어.webp';
    const nfd = nfc.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    const alternates = alternateAuthenticatedRawPaths(nfc);
    // macOS-stored NFD file must be reachable when the mention is NFC.
    expect(alternates).toEqual(expect.arrayContaining([
      nfd,
      `refs/drive/${nfd}`,
      `uploads/${nfd}`,
    ]));
  });
});

describe('loadAuthenticatedProjectFileBlob', () => {
  beforeEach(() => {
    resetProjectRawFileFetchCacheForTests();
    resetInflightProjectFileBlobLoadsForTests();
  });

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
    expect(waitForPrefix).toHaveBeenCalledWith('project-1', { quick: false });
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

  it('reloads after a 304 Not Modified with an empty body', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const imageBlob = new Blob([pngBytes], { type: 'image/png' });
    const fetchDaemon = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 304 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => imageBlob,
      } as Response);

    const blob = await loadAuthenticatedProjectFileBlob('project-1', 'uploads/mark.png', {
      delaysMs: [0],
      fetchDaemon: fetchDaemon as typeof import('../../src/teamver/teamverDaemonHeaders').fetchTeamverDaemon,
      waitForPrefix: vi.fn().mockResolvedValue(null) as typeof import('../../src/teamver/teamverProjectS3PrefixResolve').waitForTeamverProjectStoragePrefix,
    });

    expect(fetchDaemon).toHaveBeenCalledTimes(2);
    expect(fetchDaemon.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ cache: 'reload' }));
    expect(blob?.type).toBe('image/png');
  });

  it('retries transient 404s for trusted uploads instead of poisoning the missing cache', async () => {
    const imageBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const fetchDaemon = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => imageBlob,
      } as Response);

    const blob = await loadAuthenticatedProjectFileBlob(
      'project-1',
      'ms798rzf-drawing-2026-07-30T08-31-44-563Z.png',
      {
        delaysMs: [0, 0],
        trustExists: true,
        fetchDaemon: fetchDaemon as typeof import('../../src/teamver/teamverDaemonHeaders').fetchTeamverDaemon,
        waitForPrefix: vi.fn().mockResolvedValue(null) as typeof import('../../src/teamver/teamverProjectS3PrefixResolve').waitForTeamverProjectStoragePrefix,
      },
    );

    expect(fetchDaemon).toHaveBeenCalledTimes(2);
    expect(blob).toBe(imageBlob);
  });

  it('does not clear missing cache for trustExists alone (prevents remount /raw/ spam)', async () => {
    const drawingPath = 'msees0i8-drawing-2026-08-04T08-41-03-101Z.png';
    markProjectRawFileMissing('project-1', drawingPath);
    const fetchDaemon = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob([new Uint8Array([1])], { type: 'image/png' }),
    } as Response);

    const blob = await loadAuthenticatedProjectFileBlob('project-1', drawingPath, {
      delaysMs: [0],
      trustExists: true,
      fetchDaemon: fetchDaemon as typeof import('../../src/teamver/teamverDaemonHeaders').fetchTeamverDaemon,
      waitForPrefix: vi.fn().mockResolvedValue(null) as typeof import('../../src/teamver/teamverProjectS3PrefixResolve').waitForTeamverProjectStoragePrefix,
    });

    expect(blob).toBeNull();
    expect(fetchDaemon).not.toHaveBeenCalled();
    expect(isProjectRawFileKnownMissing('project-1', drawingPath)).toBe(true);
  });

  it('allows one scratch-race raw read when trustExists + allowBackgroundRetry', async () => {
    const drawingPath = 'msees0i8-drawing-2026-08-04T08-41-03-101Z.png';
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const imageBlob = new Blob([pngBytes], { type: 'image/png' });
    markProjectRawFileMissing('project-1', drawingPath);
    const fetchDaemon = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => imageBlob,
    } as Response);

    const blob = await loadAuthenticatedProjectFileBlob('project-1', drawingPath, {
      delaysMs: [0],
      trustExists: true,
      allowBackgroundRetry: true,
      fetchDaemon: fetchDaemon as typeof import('../../src/teamver/teamverDaemonHeaders').fetchTeamverDaemon,
      waitForPrefix: vi.fn().mockResolvedValue(null) as typeof import('../../src/teamver/teamverProjectS3PrefixResolve').waitForTeamverProjectStoragePrefix,
    });

    expect(blob).toBe(imageBlob);
    expect(isProjectRawFileKnownMissing('project-1', drawingPath)).toBe(false);
    expect(fetchDaemon).toHaveBeenCalledTimes(1);
  });

  it('marks drawing screenshots missing after a single 404 pass and skips repeat fetches', async () => {
    const fetchDaemon = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);

    const blob = await loadAuthenticatedProjectFileBlob(
      'project-1',
      'mse1zt0l-drawing-2026-08-04T02-43-07-413Z.png',
      {
        delaysMs: [0],
        fetchDaemon: fetchDaemon as typeof import('../../src/teamver/teamverDaemonHeaders').fetchTeamverDaemon,
        waitForPrefix: vi.fn().mockResolvedValue(null) as typeof import('../../src/teamver/teamverProjectS3PrefixResolve').waitForTeamverProjectStoragePrefix,
      },
    );

    expect(blob).toBeNull();
    expect(fetchDaemon).toHaveBeenCalledTimes(1);
    expect(isProjectRawFileKnownMissing('project-1', 'mse1zt0l-drawing-2026-08-04T02-43-07-413Z.png')).toBe(true);
    expect(isProjectRawFileKnownMissing('project-1', 'uploads/mse1zt0l-drawing-2026-08-04T02-43-07-413Z.png')).toBe(true);

    const again = await loadAuthenticatedProjectFileBlob(
      'project-1',
      'mse1zt0l-drawing-2026-08-04T02-43-07-413Z.png',
      {
        delaysMs: [0],
        fetchDaemon: fetchDaemon as typeof import('../../src/teamver/teamverDaemonHeaders').fetchTeamverDaemon,
        waitForPrefix: vi.fn().mockResolvedValue(null) as typeof import('../../src/teamver/teamverProjectS3PrefixResolve').waitForTeamverProjectStoragePrefix,
      },
    );

    expect(again).toBeNull();
    expect(fetchDaemon).toHaveBeenCalledTimes(1);
  });

  it('tries alternate paths only on the first pass when trustExists is set', async () => {
    const fetchDaemon = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);

    await loadAuthenticatedProjectFileBlob(
      'project-1',
      'mse1zt0l-drawing-2026-08-04T02-43-07-413Z.png',
      {
        delaysMs: [0, 0],
        trustExists: true,
        fetchDaemon: fetchDaemon as typeof import('../../src/teamver/teamverDaemonHeaders').fetchTeamverDaemon,
        waitForPrefix: vi.fn().mockResolvedValue(null) as typeof import('../../src/teamver/teamverProjectS3PrefixResolve').waitForTeamverProjectStoragePrefix,
      },
    );

    // primary + refs/drive + refs + uploads + assets on attempt 0, then primary only on attempt 1
    expect(fetchDaemon).toHaveBeenCalledTimes(6);
  });

  it('dedupes concurrent loads for the same project/path', async () => {
    const imageBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const fetchDaemon = vi.fn().mockImplementation(async () => ({
      ok: true,
      blob: async () => imageBlob,
    } as Response));

    const [a, b] = await Promise.all([
      loadAuthenticatedProjectFileBlob('project-1', 'mark.png', {
        delaysMs: [0],
        fetchDaemon: fetchDaemon as typeof import('../../src/teamver/teamverDaemonHeaders').fetchTeamverDaemon,
        waitForPrefix: vi.fn().mockResolvedValue(null) as typeof import('../../src/teamver/teamverProjectS3PrefixResolve').waitForTeamverProjectStoragePrefix,
      }),
      loadAuthenticatedProjectFileBlob('project-1', 'mark.png', {
        delaysMs: [0],
        fetchDaemon: fetchDaemon as typeof import('../../src/teamver/teamverDaemonHeaders').fetchTeamverDaemon,
        waitForPrefix: vi.fn().mockResolvedValue(null) as typeof import('../../src/teamver/teamverProjectS3PrefixResolve').waitForTeamverProjectStoragePrefix,
      }),
    ]);

    expect(a).toBe(imageBlob);
    expect(b).toBe(imageBlob);
    expect(fetchDaemon).toHaveBeenCalledTimes(1);
  });
});
