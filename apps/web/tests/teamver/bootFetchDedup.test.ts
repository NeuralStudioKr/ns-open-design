import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  resolveTeamverDesignApiBase: vi.fn(() => ''),
}));

vi.mock('../../src/teamver/teamverEmbedSession', () => ({
  isTeamverEmbedSessionAuthenticated: vi.fn(() => true),
}));

vi.mock('../../src/teamver/teamverDaemonHeaders', () => ({
  fetchTeamverDaemon: vi.fn(),
  buildTeamverDaemonRequestHeaders: vi.fn(async () => ({})),
}));

vi.mock('../../src/teamver/projectRegistry', () => ({
  filterProjectsByTeamverRegistryIfNeeded: vi.fn(async (projects: unknown[]) => projects),
}));

import { fetchTeamverDaemon } from '../../src/teamver/teamverDaemonHeaders';
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
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('coalesces concurrent listRecentProjects calls', async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.mocked(fetchTeamverDaemon).mockReturnValue(pending);

    const first = listRecentProjects(6);
    const second = listRecentProjects(6);
    expect(fetchTeamverDaemon).toHaveBeenCalledTimes(1);

    resolveFetch(
      new Response(JSON.stringify({ projects: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
  });

  it('coalesces concurrent listProjectRuns calls', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ runs: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const first = listProjectRuns();
    const second = listProjectRuns();
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent listTemplates calls', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ templates: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const first = listTemplates();
    const second = listTemplates();
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(1);
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
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ version: { version: '1.2.3' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const first = fetchDaemonAppVersion();
    const second = fetchDaemonAppVersion();
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
