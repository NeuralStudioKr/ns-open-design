// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedProjectFileImage } from '../../src/components/AuthenticatedProjectFileImage';
import {
  isProjectRawFileKnownMissing,
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
  it('prefers a presigned S3 GET for file-viewer previews too', async () => {
    const drawingPath = 'msfhfxov-drawing-2026-08-05T02-43-24-475Z.png';
    fetchDaemonMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ready',
        path: drawingPath,
        url: 'https://bucket.s3.amazonaws.com/design/ws/proj/viewer.png?X-Amz-Signature=abc',
        expiresInSec: 120,
        expiresAt: '2026-08-05T06:02:00.000Z',
        rawUrl: `/api/projects/project-1/raw/${drawingPath}`,
      }),
    } as Response);

    const { container } = render(
      <AuthenticatedProjectFileImage
        projectId="project-1"
        path={drawingPath}
        rev={1785897805135}
        trustExists
        allowBackgroundRetry
      />,
    );

    await vi.waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBe(
        'https://bucket.s3.amazonaws.com/design/ws/proj/viewer.png?X-Amz-Signature=abc',
      );
    });
    expect(fetchDaemonMock).toHaveBeenCalledWith(
      '/api/projects/project-1/presign-get',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchDaemonMock.mock.calls.some(([url]) => String(url).includes('/raw/'))).toBe(false);
  });

  it('prefers a presigned S3 GET for chat thumbnails', async () => {
    const drawingPath = 'msees0i8-drawing-2026-08-04T08-41-03-101Z.png';
    fetchDaemonMock.mockResolvedValue({
      ok: true,
      status: 200,
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
  });

  it('does not fall back to /raw/ when mint reports the drawing missing', async () => {
    const drawingPath = 'msczyywd-drawing-2026-08-03T08-58-43-316Z.png';
    fetchDaemonMock.mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const { container } = render(
      <AuthenticatedProjectFileImage
        projectId="project-1"
        path={drawingPath}
      />,
    );

    await vi.waitFor(() => {
      expect(
        container.querySelector('.authenticated-project-file-image-failed'),
      ).toBeTruthy();
    });
    expect(isProjectRawFileKnownMissing('project-1', drawingPath)).toBe(true);
    expect(fetchDaemonMock).toHaveBeenCalledTimes(1);
    expect(String(fetchDaemonMock.mock.calls[0]?.[0])).toContain('/presign-get');
    expect(fetchDaemonMock.mock.calls.some(([url]) => String(url).includes('/raw/'))).toBe(false);
    expect(container.querySelector('img')).toBeNull();
  });

  it('does not re-mint when trustExists remounts a known-missing drawing', async () => {
    const drawingPath = 'msczyywd-drawing-2026-08-03T08-58-43-316Z.png';
    fetchDaemonMock.mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const first = render(
      <AuthenticatedProjectFileImage
        projectId="project-1"
        path={drawingPath}
        trustExists
      />,
    );
    await vi.waitFor(() => {
      expect(
        first.container.querySelector('.authenticated-project-file-image-failed'),
      ).toBeTruthy();
    });
    expect(fetchDaemonMock).toHaveBeenCalledTimes(1);
    first.unmount();
    fetchDaemonMock.mockClear();

    const second = render(
      <AuthenticatedProjectFileImage
        projectId="project-1"
        path={drawingPath}
        trustExists
      />,
    );
    await vi.waitFor(() => {
      expect(
        second.container.querySelector('.authenticated-project-file-image-failed'),
      ).toBeTruthy();
    });
    expect(fetchDaemonMock).not.toHaveBeenCalled();
  });

  it('does not /raw/ fallback on remount even with allowBackgroundRetry after mint 404', async () => {
    const drawingPath = 'msczyywd-drawing-2026-08-03T08-58-43-316Z.png';
    const {
      markProjectRawFileMissing,
    } = await import('../../src/utils/projectFileFetchCache');
    markProjectRawFileMissing('project-1', drawingPath);
    fetchDaemonMock.mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const { container } = render(
      <AuthenticatedProjectFileImage
        projectId="project-1"
        path={drawingPath}
        trustExists
        allowBackgroundRetry
      />,
    );
    await vi.waitFor(() => {
      expect(
        container.querySelector('.authenticated-project-file-image-failed'),
      ).toBeTruthy();
    });
    expect(fetchDaemonMock).not.toHaveBeenCalled();
  });

  it('falls back to authenticated blob fetch when presign is disabled', async () => {
    const drawingPath = 'msees0i8-drawing-2026-08-04T08-41-03-101Z.png';
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    fetchDaemonMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/presign-get')) {
        return {
          ok: true,
          status: 200,
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
        status: 200,
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
