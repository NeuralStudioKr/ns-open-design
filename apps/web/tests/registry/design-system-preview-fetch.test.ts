import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  isBootstrapAuthMode: vi.fn(() => true),
}));

vi.mock('../../src/teamver/teamverDaemonHeaders', () => ({
  fetchTeamverDaemon: vi.fn(),
}));

import { fetchTeamverDaemon } from '../../src/teamver/teamverDaemonHeaders';
import {
  fetchDesignSystemPreview,
  fetchDesignSystemPreviewResult,
  fetchDesignSystemsResult,
} from '../../src/providers/registry';

const fetchTeamverDaemonMock = vi.mocked(fetchTeamverDaemon);

describe('design system preview fetch', () => {
  beforeEach(() => {
    fetchTeamverDaemonMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads preview HTML via fetchTeamverDaemon', async () => {
    fetchTeamverDaemonMock.mockResolvedValue(
      new Response('<html><body>ok</body></html>', { status: 200 }),
    );
    await expect(fetchDesignSystemPreviewResult('arc')).resolves.toEqual({
      ok: true,
      html: '<html><body>ok</body></html>',
    });
    expect(fetchTeamverDaemonMock).toHaveBeenCalledWith('/api/design-systems/arc/preview');
  });

  it('maps 401 to unauthorized for calm picker retry UX', async () => {
    fetchTeamverDaemonMock.mockResolvedValue(
      new Response('{"detail":"Unauthorized"}', { status: 401 }),
    );
    await expect(fetchDesignSystemPreviewResult('arc')).resolves.toEqual({
      ok: false,
      reason: 'unauthorized',
    });
    await expect(fetchDesignSystemPreview('arc')).resolves.toBeNull();
  });

  it('loads design-system catalog via fetchTeamverDaemon', async () => {
    fetchTeamverDaemonMock.mockResolvedValue(
      new Response(JSON.stringify({ designSystems: [{ id: 'arc', title: 'Arc' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(fetchDesignSystemsResult()).resolves.toEqual({
      ok: true,
      designSystems: [{ id: 'arc', title: 'Arc' }],
    });
    expect(fetchTeamverDaemonMock).toHaveBeenCalledWith('/api/design-systems');
  });
});
