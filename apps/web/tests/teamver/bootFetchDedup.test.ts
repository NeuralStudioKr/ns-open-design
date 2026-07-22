import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  resolveTeamverDesignApiBase: vi.fn(() => ''),
}));

vi.mock('../../src/teamver/teamverEmbedSession', () => ({
  isTeamverEmbedSessionAuthenticated: vi.fn(() => true),
}));

vi.mock('../../src/teamver/designBffClient', () => ({
  isDesignAuthRefreshDeclined: vi.fn(() => false),
}));

vi.mock('../../src/teamver/teamverDaemonHeaders', () => ({
  fetchTeamverDaemon: vi.fn(),
  buildTeamverDaemonRequestHeaders: vi.fn(async () => ({})),
}));

vi.mock('../../src/teamver/activeTeamverWorkspace', () => ({
  readActiveTeamverWorkspaceId: vi.fn(async () => 'ws-1'),
}));

vi.mock('../../src/teamver/projectRegistry', () => ({
  TeamverProjectRegistryError: class TeamverProjectRegistryError extends Error {},
  filterProjectsByTeamverRegistryIfNeeded: vi.fn(async (projects: unknown[]) => projects),
  waitForTeamverRegistrySyncIfNeeded: vi.fn(async () => undefined),
  listTeamverRegistryProjects: vi.fn(async () => []),
}));

import { fetchTeamverDaemon } from '../../src/teamver/teamverDaemonHeaders';
import { isTeamverEmbedMode } from '../../src/teamver/designApiBase';
import { isTeamverEmbedSessionAuthenticated } from '../../src/teamver/teamverEmbedSession';
import { isDesignAuthRefreshDeclined } from '../../src/teamver/designBffClient';
import { readActiveTeamverWorkspaceId } from '../../src/teamver/activeTeamverWorkspace';
import { resetDaemonAppVersionCacheForTests, fetchDaemonAppVersion } from '../../src/teamver/daemonAppVersion';
import {
  listRecentProjects,
  listTemplates,
  resetListRecentProjectsInflightForTests,
  resetListTemplatesInflightForTests,
} from '../../src/state/projects';
import {
  fetchDaemonConfig,
  resetFetchDaemonConfigInflightForTests,
} from '../../src/state/config';
import {
  fetchLiveArtifacts,
  resetFetchLiveArtifactsInflightForTests,
} from '../../src/providers/registry';
import {
  listProjectRuns,
  resetListProjectRunsInflightForTests,
} from '../../src/providers/daemon';

describe('boot fetch dedup', () => {
  beforeEach(() => {
    resetListRecentProjectsInflightForTests();
    resetListProjectRunsInflightForTests();
    resetListTemplatesInflightForTests();
    resetFetchDaemonConfigInflightForTests();
    resetDaemonAppVersionCacheForTests();
    resetFetchLiveArtifactsInflightForTests();
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(readActiveTeamverWorkspaceId).mockResolvedValue('ws-1');
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
    vi.mocked(isDesignAuthRefreshDeclined).mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('coalesces concurrent listRecentProjects calls', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.mocked(fetchTeamverDaemon).mockReturnValue(pending);

    const first = listRecentProjects(6);
    const second = listRecentProjects(6);
    await vi.waitFor(() => {
      expect(fetchTeamverDaemon).toHaveBeenCalledTimes(1);
    });

    resolveFetch(
      new Response(JSON.stringify({ projects: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
  });

  it('does not coalesce listRecentProjects across active workspaces', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    let workspaceReads = 0;
    vi.mocked(readActiveTeamverWorkspaceId).mockImplementation(async () => {
      workspaceReads += 1;
      return workspaceReads === 1 ? 'ws-1' : 'ws-2';
    });
    const { listTeamverRegistryProjects } = await import('../../src/teamver/projectRegistry');
    vi.mocked(listTeamverRegistryProjects).mockResolvedValue([
      {
        odProjectId: 'p1',
        title: 'Deck',
        updatedAt: 100,
      },
    ] as never);
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(
      new Response(JSON.stringify({ projects: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await listRecentProjects(6);
    expect(listTeamverRegistryProjects).toHaveBeenCalledTimes(1);

    await listRecentProjects(6);
    expect(listTeamverRegistryProjects).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent listProjectRuns calls', async () => {
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(
      new Response(JSON.stringify({ runs: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const first = listProjectRuns();
    const second = listProjectRuns();
    await Promise.all([first, second]);
    expect(fetchTeamverDaemon).toHaveBeenCalledTimes(1);
    expect(fetchTeamverDaemon).toHaveBeenCalledWith('/api/runs', {
      skipEmbedAuthRecovery: true,
    });
  });

  it('skips listProjectRuns network calls before embed auth is ready', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(false);

    await expect(listProjectRuns()).resolves.toEqual([]);
    expect(fetchTeamverDaemon).not.toHaveBeenCalled();
  });

  it('skips listProjectRuns network calls while auth refresh is declined', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(isDesignAuthRefreshDeclined).mockReturnValue(true);

    await expect(listProjectRuns()).resolves.toEqual([]);
    expect(fetchTeamverDaemon).not.toHaveBeenCalled();
  });

  it('coalesces concurrent listTemplates calls', async () => {
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(
      new Response(JSON.stringify({ templates: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const first = listTemplates();
    const second = listTemplates();
    await Promise.all([first, second]);
    expect(fetchTeamverDaemon).toHaveBeenCalledTimes(1);
    expect(fetchTeamverDaemon).toHaveBeenCalledWith('/api/templates', undefined);
  });

  it('skips listTemplates network calls before embed auth is ready', async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(false);

    await expect(listTemplates()).resolves.toEqual([]);
    expect(fetchTeamverDaemon).not.toHaveBeenCalled();
  });

  it('coalesces concurrent fetchDaemonConfig calls', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ config: { onboardingCompleted: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const first = fetchDaemonConfig();
    const second = fetchDaemonConfig();
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent fetchDaemonAppVersion calls', async () => {
    vi.mocked(fetchTeamverDaemon).mockResolvedValue(
      new Response(JSON.stringify({ version: { version: '1.2.3' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const first = fetchDaemonAppVersion();
    const second = fetchDaemonAppVersion();
    await Promise.all([first, second]);
    expect(fetchTeamverDaemon).toHaveBeenCalledTimes(1);
    expect(fetchTeamverDaemon).toHaveBeenCalledWith('/api/version', {
      cache: 'no-store',
      skipEmbedAuthRecovery: true,
    });
  });

  it('coalesces concurrent fetchLiveArtifacts calls for the same project', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ liveArtifacts: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const first = fetchLiveArtifacts('project-1');
    const second = fetchLiveArtifacts('project-1');
    await Promise.all([first, second]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/live-artifacts?projectId=project-1');
  });
});
