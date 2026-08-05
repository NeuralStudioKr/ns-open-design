// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
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
  it('loads indexed drawing screenshots even when chat history poisoned the missing cache', async () => {
    const drawingPath = 'msees0i8-drawing-2026-08-04T08-41-03-101Z.png';
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    markProjectRawFileMissing('project-1', drawingPath);
    fetchDaemonMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob([pngBytes], { type: 'image/png' }),
    } as Response);

    const { container } = render(
      <AuthenticatedProjectFileImage
        projectId="project-1"
        path={drawingPath}
        trustExists
        allowBackgroundRetry
      />,
    );

    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.getAttribute('alt')).toBe('');
      expect(img?.getAttribute('src')).toMatch(/^blob:/);
    });
    expect(fetchDaemonMock).toHaveBeenCalled();
  });
});
