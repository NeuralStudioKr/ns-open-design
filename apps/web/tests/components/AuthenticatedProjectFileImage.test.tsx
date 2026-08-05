// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedProjectFileImage } from '../../src/components/AuthenticatedProjectFileImage';
import {
  markProjectRawFileMissing,
  resetProjectRawFileFetchCacheForTests,
} from '../../src/utils/projectFileFetchCache';

const fetchDaemonMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/teamver/designApiBase', async () => {
  const actual = await vi.importActual<typeof import('../../src/teamver/designApiBase')>(
    '../../src/teamver/designApiBase',
  );
  return {
    ...actual,
    shouldUseTeamverAuthenticatedProjectRawFetch: vi.fn(() => true),
  };
});

vi.mock('../../src/teamver/teamverDaemonHeaders', async () => {
  const actual = await vi.importActual<typeof import('../../src/teamver/teamverDaemonHeaders')>(
    '../../src/teamver/teamverDaemonHeaders',
  );
  return {
    ...actual,
    fetchTeamverDaemon: fetchDaemonMock,
  };
});

vi.mock('../../src/teamver/teamverProjectS3PrefixResolve', async () => {
  const actual = await vi.importActual<typeof import('../../src/teamver/teamverProjectS3PrefixResolve')>(
    '../../src/teamver/teamverProjectS3PrefixResolve',
  );
  return {
    ...actual,
    waitForTeamverProjectStoragePrefix: vi.fn().mockResolvedValue(null),
  };
});

afterEach(() => {
  cleanup();
  resetProjectRawFileFetchCacheForTests();
  fetchDaemonMock.mockReset();
  vi.restoreAllMocks();
});

describe('AuthenticatedProjectFileImage', () => {
  it('uses same-origin raw URL for indexed file viewer previews', () => {
    const drawingPath = 'msfhfxov-drawing-2026-08-05T02-43-24-475Z.png';
    markProjectRawFileMissing('project-1', drawingPath);

    const { container } = render(
      <AuthenticatedProjectFileImage
        projectId="project-1"
        path={drawingPath}
        rev={1785897805135}
        trustExists
        allowBackgroundRetry
      />,
    );

    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('src')).toBe(
      '/api/projects/project-1/raw/msfhfxov-drawing-2026-08-05T02-43-24-475Z.png?v=1785897805135',
    );
    expect(fetchDaemonMock).not.toHaveBeenCalled();
  });

  it('prefers a presigned S3 GET for chat thumbnails', async () => {
    const drawingPath = 'msees0i8-drawing-2026-08-04T08-41-03-101Z.png';
    fetchDaemonMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ready',
        path: drawingPath,
        url: 'https://bucket.s3.amazonaws.com/design/ws/proj/drawing.png?X-Amz-Signature=abc',
        expiresInSec: 120,
        expiresAt: '2026-08-05T06:02:00.000Z',
        rawUrl: `/api/projects/project-1/raw/${drawingPath}`,
      }),
    } as Response);

    const { container } = render(
      <AuthenticatedProjectFileImage
        projectId="project-1"
        path={drawingPath}
        trustExists
      />,
    );

    await vi.waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBe(
        'https://bucket.s3.amazonaws.com/design/ws/proj/drawing.png?X-Amz-Signature=abc',
      );
    });
    expect(fetchDaemonMock).toHaveBeenCalledWith(
      '/api/projects/project-1/presign-get',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('falls back to authenticated blob fetch when presign is disabled', async () => {
    const drawingPath = 'msees0i8-drawing-2026-08-04T08-41-03-101Z.png';
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    fetchDaemonMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/presign-get')) {
        return {
          ok: true,
          json: async () => ({
            status: 'disabled',
            path: drawingPath,
            rawUrl: `/api/projects/project-1/raw/${drawingPath}`,
            reason: 'local_storage',
          }),
        } as Response;
      }
      return {
        ok: true,
        blob: async () => new Blob([pngBytes], { type: 'image/png' }),
      } as Response;
    });

    const { container } = render(
      <AuthenticatedProjectFileImage
        projectId="project-1"
        path={drawingPath}
        trustExists
      />,
    );

    await vi.waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toMatch(/^blob:/);
    });
  });
});
