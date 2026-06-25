import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportTeamverUsageFromDaemon } from '../src/teamver-usage-bridge.js';

function findUsage5xxMarker(spy: ReturnType<typeof vi.spyOn>, stage: string) {
  for (const call of spy.mock.calls) {
    const arg = call[0];
    if (typeof arg !== 'string') continue;
    try {
      const parsed = JSON.parse(arg) as Record<string, unknown>;
      if (parsed.metric === 'teamver_usage_5xx' && parsed.stage === stage) {
        return parsed;
      }
    } catch {
      // ignore non-JSON warns
    }
  }
  return null;
}

function findUsageMarker(
  spy: ReturnType<typeof vi.spyOn>,
  stage: string,
): Record<string, unknown> | null {
  for (const call of spy.mock.calls) {
    const arg = call[0];
    if (typeof arg !== 'string') continue;
    try {
      const parsed = JSON.parse(arg) as Record<string, unknown>;
      if (parsed.stage === stage) {
        return parsed;
      }
    } catch {
      // ignore non-JSON warns
    }
  }
  return null;
}

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

  it('posts usage metadata fields for terminal teamver runs', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    await reportTeamverUsageFromDaemon({
      run: {
        id: 'run-meta',
        projectId: 'od-meta',
        status: 'succeeded',
        model: 'claude-sonnet-4-5',
        createdAt: 1_000,
        updatedAt: 2_500,
        apiProtocol: 'claude-agent',
        teamverIdentity: { userId: 'u1', workspaceId: 'ws1' },
        events: [
          {
            event: 'agent',
            data: {
              type: 'usage',
              usage: {
                input_tokens: 100,
                output_tokens: 40,
                cache_read_input_tokens: 200,
                cache_creation_input_tokens: 50,
              },
              model: 'claude-sonnet-4-5-20250929',
            },
          },
          {
            event: 'agent',
            data: { type: 'result', stop_reason: 'end_turn' },
          },
        ],
      },
      reportedRuns: new Set(),
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown[])[1]?.body))).toMatchObject({
      cache_read_input_tokens: 200,
      cache_creation_input_tokens: 50,
      provider_reported_model: 'claude-sonnet-4-5-20250929',
      api_protocol: 'claude-agent',
      latency_ms: 1500,
      stop_reason: 'end_turn',
    });
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
      token_count_source: 'provider_usage',
      billing_status: 'not_configured',
      credits_committed: false,
    });
  });

  it('reads BYOK top-level usage events for token reporting', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    await reportTeamverUsageFromDaemon({
      run: {
        id: 'run-byok',
        status: 'succeeded',
        model: 'gpt-4o',
        teamverIdentity: { userId: 'u1', workspaceId: 'ws1' },
        events: [
          {
            event: 'usage',
            data: { input_tokens: 50, output_tokens: 12, model: 'gpt-4o' },
          },
        ],
      },
      reportedRuns: new Set(),
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown[])[1]?.body));
    expect(body).toMatchObject({
      input_tokens: 50,
      output_tokens: 12,
      model_name: 'gpt-4o',
      token_count_source: 'provider_usage',
    });
  });

  it('emits structured teamver_usage_5xx marker on non-ok response (CW filter wire-compat)', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => 'service degraded',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await reportTeamverUsageFromDaemon({
      run: {
        id: 'run-2',
        projectId: 'od2',
        status: 'succeeded',
        model: 'claude-sonnet-4-5',
        teamverIdentity: { userId: 'u2', workspaceId: 'ws2' },
        events: [
          {
            event: 'agent',
            data: {
              type: 'usage',
              usage: { input_tokens: 5, output_tokens: 10 },
            },
          },
        ],
      },
      reportedRuns: new Set(),
    });

    const marker = findUsage5xxMarker(warnSpy, 'usage.events');
    expect(marker).not.toBeNull();
    expect(marker).toMatchObject({
      metric: 'teamver_usage_5xx',
      stage: 'usage.events',
      runId: 'run-2',
      workspaceId: 'ws2',
      projectId: 'od2',
      modelName: 'claude-sonnet-4-5',
      httpStatus: 503,
      body: 'service degraded',
    });
    expect(typeof marker?.ts).toBe('number');
  });

  it('emits structured teamver_usage_5xx marker on fetch throw (network/timeout)', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    vi.stubGlobal('fetch', fetchMock);

    await reportTeamverUsageFromDaemon({
      run: {
        id: 'run-3',
        projectId: null,
        status: 'failed',
        model: 'claude-sonnet-4-5',
        teamverIdentity: { userId: 'u3', workspaceId: 'ws3' },
        events: [],
      },
      reportedRuns: new Set(),
    });

    const marker = findUsage5xxMarker(warnSpy, 'usage.events');
    expect(marker).not.toBeNull();
    expect(marker).toMatchObject({
      metric: 'teamver_usage_5xx',
      stage: 'usage.events',
      runId: 'run-3',
      workspaceId: 'ws3',
      projectId: null,
      error: 'ECONNREFUSED',
    });
  });

  it('truncates response body to 200 chars in marker payload', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const longBody = 'x'.repeat(500);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => longBody,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await reportTeamverUsageFromDaemon({
      run: {
        id: 'run-4',
        status: 'succeeded',
        model: 'm',
        teamverIdentity: { userId: 'u4', workspaceId: 'ws4' },
        events: [],
      },
      reportedRuns: new Set(),
    });

    const marker = findUsage5xxMarker(warnSpy, 'usage.events');
    expect(marker).not.toBeNull();
    expect((marker?.body as string).length).toBe(200);
  });

  // Loop 391 observability: a terminal run that lands with 0/0 tokens means
  // the provider gave us nothing (or our extractor regressed). Emit a beacon
  // BEFORE posting so the CloudWatch metric filter can alert before the
  // billing dispute hits support.
  it('emits zero_tokens beacon when terminal run has no usage data', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    await reportTeamverUsageFromDaemon({
      run: {
        id: 'run-zero',
        projectId: 'p-zero',
        status: 'succeeded',
        model: 'claude-sonnet-4-5',
        teamverIdentity: { userId: 'u-zero', workspaceId: 'ws-zero' },
        events: [
          { event: 'agent', data: { type: 'status', label: 'model', model: 'claude-sonnet-4-5' } },
        ],
      },
      reportedRuns: new Set(),
    });

    const marker = findUsageMarker(warnSpy, 'usage.zero_tokens');
    expect(marker).not.toBeNull();
    expect(marker).toMatchObject({
      metric: 'teamver_usage_5xx',
      stage: 'usage.zero_tokens',
      runId: 'run-zero',
      workspaceId: 'ws-zero',
      modelName: 'claude-sonnet-4-5',
      tokenCountSource: 'unknown',
    });
    // We still post the row even when 0/0 — BE creates the ledger entry so
    // the billing finalize stub still has something to merge into.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT emit zero_tokens beacon when run has non-zero usage', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    await reportTeamverUsageFromDaemon({
      run: {
        id: 'run-nonzero',
        status: 'succeeded',
        model: 'gpt-4o',
        teamverIdentity: { userId: 'u', workspaceId: 'ws' },
        events: [
          {
            event: 'usage',
            data: { input_tokens: 100, output_tokens: 25, model: 'gpt-4o' },
          },
        ],
      },
      reportedRuns: new Set(),
    });

    const marker = findUsageMarker(warnSpy, 'usage.zero_tokens');
    expect(marker).toBeNull();
  });
});
