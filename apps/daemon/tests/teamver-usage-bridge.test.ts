import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportTeamverUsageFromDaemon } from '../src/teamver-usage-bridge.js';

describe('teamver-usage-bridge.reportTeamverUsageFromDaemon', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('skips when teamver env is not configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await reportTeamverUsageFromDaemon({
      run: {
        id: 'run-1',
        status: 'succeeded',
        events: [],
        teamverIdentity: { userId: 'u1', workspaceId: 'ws1' },
      },
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts internal usage event for terminal teamver runs', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    await reportTeamverUsageFromDaemon({
      run: {
        id: 'run-1',
        projectId: 'od1',
        status: 'succeeded',
        model: 'claude-sonnet-4-5',
        teamverIdentity: { userId: 'u1', workspaceId: 'ws1' },
        events: [
          {
            event: 'agent',
            data: {
              type: 'usage',
              usage: { input_tokens: 11, output_tokens: 22 },
            },
          },
        ],
      },
      reportedRuns: new Set(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://design-api:16000/api/internal/usage/events');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['X-Teamver-Internal-Api-Key']).toBe('secret-key');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      user_id: 'u1',
      workspace_id: 'ws1',
      input_tokens: 11,
      output_tokens: 22,
      project_id: 'od1',
      run_id: 'run-1',
    });
  });
});
