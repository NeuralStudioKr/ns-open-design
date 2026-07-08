import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock('../../src/teamver/teamverDaemonHeaders', () => ({
  fetchTeamverDaemon: vi.fn(),
}));

vi.mock('../../src/teamver/projectRegistry', () => ({
  fetchTeamverProject: vi.fn(),
}));

import { isTeamverEmbedMode } from '../../src/teamver/designApiBase';
import { fetchTeamverProject } from '../../src/teamver/projectRegistry';
import { fetchTeamverDaemon } from '../../src/teamver/teamverDaemonHeaders';
import { getProject } from '../../src/state/projects';

describe('getProject embed registry fallback', () => {
  afterEach(() => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    vi.clearAllMocks();
  });

  it('falls back to BFF registry row when daemon returns 404', async () => {
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(new Response(null, { status: 404 }));
    vi.mocked(fetchTeamverProject).mockResolvedValue({
      odProjectId: 'p-404',
      title: 'Registry Only',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const project = await getProject('p-404');
    expect(project).toMatchObject({ id: 'p-404', name: 'Registry Only' });
    expect(fetchTeamverProject).toHaveBeenCalledWith('p-404');
  });

  it('returns daemon project when detail succeeds', async () => {
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(
      new Response(
        JSON.stringify({
          project: {
            id: 'p-ok',
            name: 'Daemon Detail',
            skillId: null,
            designSystemId: null,
            createdAt: 1,
            updatedAt: 2,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const project = await getProject('p-ok');
    expect(project).toMatchObject({ id: 'p-ok', name: 'Daemon Detail' });
    expect(fetchTeamverProject).not.toHaveBeenCalled();
  });
});
