// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesignsTabProjectThumb } from '../../src/teamver/components/DesignsTabProjectThumb';
import type { Project } from '../../src/types';

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

vi.mock('../../src/teamver/useLazyProjectCover', () => ({
  useLazyProjectCover: () => ({
    anchorRef: { current: null },
    cover: {
      kind: 'image' as const,
      filePath: 'msczyywd-drawing-2026-08-03T08-58-43-316Z.png',
      version: 1700000999000,
      src: '/api/projects/p1/raw/msczyywd-drawing-2026-08-03T08-58-43-316Z.png?v=1700000999000',
      style: {},
      initial: 'D',
    },
    override: {
      kind: 'image' as const,
      name: 'msczyywd-drawing-2026-08-03T08-58-43-316Z.png',
      version: 1700000999000,
    },
  }),
}));

afterEach(() => {
  cleanup();
  fetchDaemonMock.mockReset();
});

describe('DesignsTabProjectThumb image covers', () => {
  it('loads drawing covers via presign-get instead of /raw/ img src', async () => {
    fetchDaemonMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ready',
        path: 'msczyywd-drawing-2026-08-03T08-58-43-316Z.png',
        url: 'https://bucket.s3.amazonaws.com/design/ws/proj/drawing.png?X-Amz-Signature=abc',
        expiresInSec: 120,
        expiresAt: '2026-08-05T07:00:00.000Z',
        rawUrl: '/api/projects/p1/raw/msczyywd-drawing-2026-08-03T08-58-43-316Z.png',
      }),
    } as Response);

    const project = {
      id: 'p1',
      name: 'Deck',
      skillId: null,
      createdAt: 1,
      updatedAt: 2,
    } satisfies Project;

    const { container } = render(<DesignsTabProjectThumb project={project} />);

    await vi.waitFor(() => {
      const img = container.querySelector('img.thumb-media');
      expect(img?.getAttribute('src')).toBe(
        'https://bucket.s3.amazonaws.com/design/ws/proj/drawing.png?X-Amz-Signature=abc',
      );
    });
    expect(fetchDaemonMock).toHaveBeenCalledWith(
      '/api/projects/p1/presign-get',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchDaemonMock.mock.calls.some(([url]) => String(url).includes('/raw/'))).toBe(false);
  });
});
