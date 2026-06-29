import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  chatMessageEventsToRunAnalyticsEvents,
  createByokProxyUsageBillingStager,
  peekStagedByokProxyUsageForTests,
  reportByokTeamverUsageAndBillingFromDaemon,
  resetByokBillingStagingForTests,
  resetByokInFlightReportsForTests,
  shouldReportByokUsageFromMessage,
  sweepExpiredByokBillingStagesForTests,
  peekBillingOrphanAdminQueueForTests,
} from '../src/teamver-byok-usage-bridge.js';

describe('teamver-byok-usage-bridge', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetByokInFlightReportsForTests();
    resetByokBillingStagingForTests();
  });

  it('shouldReportByokUsageFromMessage requires assistant terminal BYOK message', () => {
    expect(
      shouldReportByokUsageFromMessage(
        {
          id: 'm1',
          role: 'assistant',
          runStatus: 'succeeded',
          events: [],
        },
        { telemetryFinalized: true },
      ),
    ).toBe(true);
    expect(
      shouldReportByokUsageFromMessage(
        { id: 'm2', role: 'assistant', runId: 'run-1', runStatus: 'succeeded' },
        { telemetryFinalized: true },
      ),
    ).toBe(false);
    expect(
      shouldReportByokUsageFromMessage(
        { id: 'm3', role: 'user', runStatus: 'succeeded' },
        { telemetryFinalized: true },
      ),
    ).toBe(false);
  });

  it('maps chat message usage events to run analytics wire shape', () => {
    expect(
      chatMessageEventsToRunAnalyticsEvents([
        {
          kind: 'usage',
          inputTokens: 10,
          outputTokens: 5,
          model: 'claude-sonnet-4-5',
          apiProtocol: 'anthropic',
        },
      ]),
    ).toEqual([
      {
        event: 'usage',
        data: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: undefined,
          cache_creation_input_tokens: undefined,
          model: 'claude-sonnet-4-5',
          stop_reason: undefined,
          api_protocol: 'anthropic',
          latency_ms: undefined,
        },
      },
    ]);
  });

  it('posts billing finalize then usage for succeeded BYOK message', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');
    vi.stubEnv('TEAMVER_OD_API_MODEL', 'claude-sonnet-4-5');

    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      calls.push({ url, body });
      if (url.endsWith('/api/internal/billing/finalize-byok-run')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              ok: true,
              usage_id: 'u-byok',
              billing_status: 'committed',
              credits_committed: true,
              credits_amount_t: 42,
            }),
        };
      }
      return { ok: true, status: 204, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);

    const reportedRuns = new Set<string>();
    const ok = await reportByokTeamverUsageAndBillingFromDaemon({
      message: {
        id: 'assistant-msg-1',
        role: 'assistant',
        runStatus: 'succeeded',
        startedAt: 1_000,
        endedAt: 2_500,
        events: [
          { kind: 'status', label: 'model', detail: 'claude-sonnet-4-5' },
          { kind: 'usage', inputTokens: 100, outputTokens: 50, apiProtocol: 'anthropic' },
        ],
      },
      projectId: 'od-1',
      identity: { userId: 'user-1', workspaceId: 'ws-1' },
      reportedRuns,
    });

    expect(ok).toBe(true);
    expect(calls.map((c) => c.url)).toEqual([
      'http://design-api:16000/api/internal/billing/finalize-byok-run',
      'http://design-api:16000/api/internal/usage/events',
    ]);
    expect(calls[0]?.body).toMatchObject({
      workspace_id: 'ws-1',
      run_id: 'assistant-msg-1',
      run_status: 'succeeded',
      input_tokens: 100,
      output_tokens: 50,
    });
    expect(calls[1]?.body).toMatchObject({
      user_id: 'user-1',
      workspace_id: 'ws-1',
      run_id: 'assistant-msg-1',
      project_id: 'od-1',
      registry_usage_id: 'u-byok',
      billing_status: 'committed',
      credits_committed: true,
      credits_amount_t: 42,
      api_protocol: 'anthropic',
      latency_ms: 1500,
    });
    expect(reportedRuns.has('byok:assistant-msg-1')).toBe(true);
  });

  it('dedupes repeated finalize for the same message id', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    const reportedRuns = new Set<string>();
    const message = {
      id: 'assistant-msg-dedupe',
      role: 'assistant' as const,
      runStatus: 'failed' as const,
      events: [{ kind: 'usage', inputTokens: 1, outputTokens: 1 }],
    };

    await reportByokTeamverUsageAndBillingFromDaemon({
      message,
      projectId: 'od-1',
      identity: { userId: 'user-1', workspaceId: 'ws-1' },
      reportedRuns,
    });
    await reportByokTeamverUsageAndBillingFromDaemon({
      message,
      projectId: 'od-1',
      identity: { userId: 'user-1', workspaceId: 'ws-1' },
      reportedRuns,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('records reserve_failed billing on usage event without double billing retry guard', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/internal/billing/finalize-byok-run')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              ok: false,
              usage_id: null,
              billing_status: 'reserve_failed',
              credits_committed: false,
              error: 'registry_denied',
            }),
        };
      }
      return { ok: true, status: 204, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);

    const reportedRuns = new Set<string>();
    const ok = await reportByokTeamverUsageAndBillingFromDaemon({
      message: {
        id: 'assistant-msg-fail',
        role: 'assistant',
        runStatus: 'succeeded',
        events: [{ kind: 'usage', inputTokens: 10, outputTokens: 5 }],
      },
      projectId: 'od-1',
      identity: { userId: 'user-1', workspaceId: 'ws-1' },
      reportedRuns,
    });

    expect(ok).toBe(true);
    const usageCall = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? '{}')) as Record<
      string,
      unknown
    >;
    expect(usageCall.billing_status).toBe('reserve_failed');
    expect(usageCall.credits_committed).toBe(false);
  });

  it('skips concurrent duplicate finalize while in flight', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    let releaseBilling!: () => void;
    const billingGate = new Promise<void>((resolve) => {
      releaseBilling = resolve;
    });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/internal/billing/finalize-byok-run')) {
        await billingGate;
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              ok: true,
              usage_id: 'u-byok',
              billing_status: 'committed',
              credits_committed: true,
            }),
        };
      }
      return { ok: true, status: 204, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);

    const message = {
      id: 'assistant-msg-concurrent',
      role: 'assistant' as const,
      runStatus: 'succeeded' as const,
      events: [{ kind: 'usage', inputTokens: 1, outputTokens: 1 }],
    };
    const args = {
      message,
      projectId: 'od-1',
      identity: { userId: 'user-1', workspaceId: 'ws-1' },
      reportedRuns: new Set<string>(),
    };

    const first = reportByokTeamverUsageAndBillingFromDaemon(args);
    await new Promise((r) => setTimeout(r, 10));
    const second = await reportByokTeamverUsageAndBillingFromDaemon(args);
    expect(second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    releaseBilling();
    await first;
  });

  it('forwards idempotent committed snapshot to usage ledger on resume', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/internal/billing/finalize-byok-run')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              ok: true,
              usage_id: 'u-existing',
              billing_status: 'committed',
              credits_committed: true,
              credits_amount_t: 21,
              idempotent: true,
            }),
        };
      }
      return { ok: true, status: 204, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);

    const reportedRuns = new Set<string>();
    const ok = await reportByokTeamverUsageAndBillingFromDaemon({
      message: {
        id: 'assistant-msg-resume',
        role: 'assistant',
        runStatus: 'succeeded',
        events: [{ kind: 'usage', inputTokens: 100, outputTokens: 50 }],
      },
      projectId: 'od-1',
      identity: { userId: 'user-1', workspaceId: 'ws-1' },
      reportedRuns,
    });

    expect(ok).toBe(true);
    const usageBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? '{}')) as Record<
      string,
      unknown
    >;
    expect(usageBody.billing_status).toBe('committed');
    expect(usageBody.registry_usage_id).toBe('u-existing');
    expect(usageBody.credits_committed).toBe(true);
    expect(usageBody.credits_amount_t).toBe(21);
    expect(reportedRuns.has('byok:assistant-msg-resume')).toBe(true);
  });

  it('forwards refund_failed terminal snapshot so ops sees the stuck row', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/internal/billing/finalize-byok-run')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              ok: false,
              usage_id: 'u-stuck',
              billing_status: 'refund_failed',
              credits_committed: false,
              credits_amount_t: 10,
              error: 'refund_failed',
              idempotent: true,
            }),
        };
      }
      return { ok: true, status: 204, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);

    const reportedRuns = new Set<string>();
    const ok = await reportByokTeamverUsageAndBillingFromDaemon({
      message: {
        id: 'assistant-msg-stuck',
        role: 'assistant',
        runStatus: 'succeeded',
        events: [{ kind: 'usage', inputTokens: 100, outputTokens: 50 }],
      },
      projectId: 'od-1',
      identity: { userId: 'user-1', workspaceId: 'ws-1' },
      reportedRuns,
    });

    expect(ok).toBe(true);
    const usageBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? '{}')) as Record<
      string,
      unknown
    >;
    expect(usageBody.billing_status).toBe('refund_failed');
    expect(usageBody.registry_usage_id).toBe('u-stuck');
    expect(usageBody.credits_committed).toBe(false);
  });

  it('skips identity missing / empty workspace silently', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const ok = await reportByokTeamverUsageAndBillingFromDaemon({
      message: {
        id: 'assistant-msg-missing-identity',
        role: 'assistant',
        runStatus: 'succeeded',
        events: [{ kind: 'usage', inputTokens: 10, outputTokens: 5 }],
      },
      projectId: 'od-1',
      identity: { userId: '', workspaceId: '' },
    });

    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stages proxy usage SSE and finalizes billing on message PUT when events lack tokens', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');
    vi.stubEnv('OD_BYOK_BILLING_STAGE_TTL_MS', '600000');

    const req = {
      headers: {
        'x-teamver-user-id': 'user-1',
        'x-teamver-workspace-id': 'ws-1',
      },
    } as import('express').Request;

    const stager = createByokProxyUsageBillingStager(req, {
      assistantMessageId: 'assistant-msg-staged',
      projectId: 'od-1',
    });
    expect(stager).toBeDefined();
    stager!({ inputTokens: 42, outputTokens: 7, model: 'claude-sonnet-4-5', apiProtocol: 'anthropic' });
    expect(peekStagedByokProxyUsageForTests('assistant-msg-staged')?.inputTokens).toBe(42);

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/internal/billing/finalize-byok-run')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              ok: true,
              usage_id: 'u-staged',
              billing_status: 'committed',
              credits_committed: true,
            }),
        };
      }
      return { ok: true, status: 204, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);

    const ok = await reportByokTeamverUsageAndBillingFromDaemon({
      message: {
        id: 'assistant-msg-staged',
        role: 'assistant',
        runStatus: 'succeeded',
        events: [],
      },
      projectId: 'od-1',
      identity: { userId: 'user-1', workspaceId: 'ws-1' },
      reportedRuns: new Set<string>(),
    });

    expect(ok).toBe(true);
    expect(peekStagedByokProxyUsageForTests('assistant-msg-staged')).toBeUndefined();
    const finalizeInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const finalizeBody = JSON.parse(String(finalizeInit?.body ?? '{}')) as Record<string, unknown>;
    expect(finalizeBody.input_tokens).toBe(42);
    expect(finalizeBody.output_tokens).toBe(7);
    expect(finalizeBody.token_count_source).toBe('proxy_sse_staged');
  });

  it('pre-seeds model from proxy body so failed runs before usage SSE still report model_name', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/internal/billing/finalize-byok-run')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              ok: true,
              usage_id: 'u-failed',
              billing_status: 'not_attempted',
              credits_committed: false,
            }),
        };
      }
      return { ok: true, status: 204, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = {
      headers: {
        'x-teamver-user-id': 'user-1',
        'x-teamver-workspace-id': 'ws-1',
      },
    } as import('express').Request;

    createByokProxyUsageBillingStager(req, {
      assistantMessageId: 'assistant-msg-failed',
      projectId: 'od-1',
      model: 'claude-sonnet-4-5',
    });

    const ok = await reportByokTeamverUsageAndBillingFromDaemon({
      message: {
        id: 'assistant-msg-failed',
        role: 'assistant',
        runStatus: 'failed',
        events: [],
      },
      projectId: 'od-1',
      identity: { userId: 'user-1', workspaceId: 'ws-1' },
      reportedRuns: new Set<string>(),
    });

    expect(ok).toBe(true);
    const usageCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith('/api/internal/usage/events'),
    );
    const finalizeBody = JSON.parse(String(usageCall?.[1]?.body ?? '{}')) as Record<string, unknown>;
    expect(finalizeBody.model_name).toBe('claude-sonnet-4-5');
    expect(finalizeBody.input_tokens).toBe(0);
    expect(finalizeBody.output_tokens).toBe(0);
    expect(finalizeBody.run_status).toBe('failed');
  });

  it('emits od_byok_billing_orphan_usage when staged usage TTL expires', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');
    vi.stubEnv('OD_BYOK_BILLING_STAGE_TTL_MS', '1');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const req = {
      headers: {
        'x-teamver-user-id': 'user-1',
        'x-teamver-workspace-id': 'ws-1',
      },
    } as import('express').Request;

    const stager = createByokProxyUsageBillingStager(req, {
      assistantMessageId: 'assistant-msg-orphan',
      projectId: 'od-1',
    });
    stager!({ inputTokens: 5, outputTokens: 3 });

    await new Promise((r) => setTimeout(r, 5));
    sweepExpiredByokBillingStagesForTests();

    const orphanLines = warnSpy.mock.calls
      .map((call) => String(call[0] ?? ''))
      .filter((line) => line.includes('od_byok_billing_orphan_usage'));
    expect(orphanLines.length).toBe(1);
    const parsed = JSON.parse(orphanLines[0]!);
    expect(parsed.messageId).toBe('assistant-msg-orphan');

    warnSpy.mockRestore();
  });

  it('queues TTL orphans for admin reconcile and emits reaper sweep marker', async () => {
    vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
    vi.stubEnv('TEAMVER_INTERNAL_API_KEY', 'secret-key');
    vi.stubEnv('OD_BYOK_BILLING_STAGE_TTL_MS', '1');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const req = {
      headers: {
        'x-teamver-user-id': 'user-1',
        'x-teamver-workspace-id': 'ws-1',
      },
    } as import('express').Request;

    const stager = createByokProxyUsageBillingStager(req, {
      assistantMessageId: 'assistant-msg-reaper',
      projectId: 'od-1',
    });
    stager!({ inputTokens: 9, outputTokens: 4 });

    await new Promise((r) => setTimeout(r, 5));
    sweepExpiredByokBillingStagesForTests();

    const queue = peekBillingOrphanAdminQueueForTests();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.messageId).toBe('assistant-msg-reaper');

    const sweepLines = warnSpy.mock.calls
      .map((call) => String(call[0] ?? ''))
      .filter((line) => line.includes('od_byok_billing_reaper_sweep'));
    expect(sweepLines.length).toBe(1);
    const parsed = JSON.parse(sweepLines[0]!);
    expect(parsed.swept).toBe(1);
    expect(parsed.queueDepth).toBe(1);

    warnSpy.mockRestore();
  });
});
