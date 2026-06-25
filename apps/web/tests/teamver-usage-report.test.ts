import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractLatestUsageFromEvents,
  extractModelNameFromEvents,
  extractProviderUsageDetails,
  isTerminalRunStatus,
  normalizeProviderUsagePayload,
  resolveTeamverUsageModelName,
  resolveTokenCountSource,
} from '../src/teamver/usageAttribution';
import {
  pinTeamverExecutionConfig,
  resetPinnedTeamverExecutionConfigForTests,
} from '../src/teamver/branding/pinnedExecutionConfig';
import {
  maybeReportTeamverUsageAfterSave,
  resetTeamverReportedRunIdsForTests,
} from '../src/teamver/maybeReportTeamverUsageAfterSave';
import * as designApiBase from '../src/teamver/designApiBase';
import * as designBffClient from '../src/teamver/designBffClient';
import * as reportUsage from '../src/teamver/reportUsage';

vi.mock('../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

vi.mock('../src/teamver/designBffClient', () => ({
  getDesignBffClient: vi.fn(() => null),
}));

vi.mock('../src/teamver/reportUsage', () => ({
  reportTeamverDesignUsage: vi.fn(async () => undefined),
}));

describe('usageAttribution', () => {
  it('detects terminal run statuses', () => {
    expect(isTerminalRunStatus('succeeded')).toBe(true);
    expect(isTerminalRunStatus('queued')).toBe(false);
  });

  it('extracts latest usage from agent events', () => {
    expect(
      extractLatestUsageFromEvents([
        { kind: 'usage', inputTokens: 10, outputTokens: 5 },
        { kind: 'usage', inputTokens: 99, outputTokens: 1 },
      ]),
    ).toEqual({
      inputTokens: 99,
      outputTokens: 1,
      tokenCountSource: 'provider_usage',
    });
  });

  it('marks zero-token usage as unknown source', () => {
    expect(resolveTokenCountSource(0, 0)).toBe('unknown');
    expect(
      extractLatestUsageFromEvents([{ kind: 'usage', inputTokens: 0, outputTokens: 0 }]),
    ).toBeNull();
  });

  it('skips trailing zero-token usage events and keeps the latest non-zero counts', () => {
    expect(
      extractLatestUsageFromEvents([
        { kind: 'usage', inputTokens: 42, outputTokens: 7 },
        { kind: 'usage', inputTokens: 0, outputTokens: 0 },
      ]),
    ).toEqual({
      inputTokens: 42,
      outputTokens: 7,
      tokenCountSource: 'provider_usage',
    });
  });

  it('normalizes provider usage payload shapes', () => {
    expect(
      normalizeProviderUsagePayload({
        input_tokens: 120,
        output_tokens: 45,
      }),
    ).toEqual({ inputTokens: 120, outputTokens: 45 });
    expect(
      normalizeProviderUsagePayload({
        usage: { prompt_tokens: 11, completion_tokens: 4 },
      }),
    ).toEqual({ inputTokens: 11, outputTokens: 4 });
  });

  it('extracts provider usage metadata including cache buckets', () => {
    expect(
      extractProviderUsageDetails({
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 3,
        model: 'gpt-4o',
        stop_reason: 'end_turn',
        latency_ms: 900,
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 20,
      cacheCreationInputTokens: 3,
      model: 'gpt-4o',
      stopReason: 'end_turn',
      latencyMs: 900,
    });
  });

  it('extracts model name from status events', () => {
    expect(
      extractModelNameFromEvents([
        { kind: 'status', label: 'model', detail: 'claude-sonnet-4-5' },
      ]),
    ).toBe('claude-sonnet-4-5');
  });

  it('prefers provider-reported model on usage event over status pin', () => {
    expect(
      extractModelNameFromEvents([
        { kind: 'status', label: 'requesting', detail: 'claude-sonnet-4-5' },
        { kind: 'usage', inputTokens: 100, outputTokens: 20, model: 'claude-sonnet-4-5-20250514' },
      ]),
    ).toBe('claude-sonnet-4-5-20250514');
  });

  it('extracts model name from API-mode requesting and daemon initializing labels', () => {
    expect(
      extractModelNameFromEvents([
        { kind: 'status', label: 'requesting', detail: 'claude-sonnet-4-5' },
      ]),
    ).toBe('claude-sonnet-4-5');
    expect(
      extractModelNameFromEvents([
        { kind: 'status', label: 'initializing', detail: 'claude-opus-4-8' },
      ]),
    ).toBe('claude-opus-4-8');
  });

  it('falls back to pinned runtime-config model when events omit model', () => {
    resetPinnedTeamverExecutionConfigForTests();
    pinTeamverExecutionConfig({
      apiKey: 'managed-key',
      model: 'claude-sonnet-4-5',
    });
    expect(resolveTeamverUsageModelName([])).toBe('claude-sonnet-4-5');
    resetPinnedTeamverExecutionConfigForTests();
  });

  it('returns unknown when model cannot be resolved', () => {
    resetPinnedTeamverExecutionConfigForTests();
    expect(resolveTeamverUsageModelName([])).toBe('unknown');
  });
});

describe('maybeReportTeamverUsageAfterSave', () => {
  beforeEach(() => {
    resetTeamverReportedRunIdsForTests();
  });
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);
    vi.mocked(reportUsage.reportTeamverDesignUsage).mockClear();
    resetTeamverReportedRunIdsForTests();
  });

  it('no-ops outside embed mode', async () => {
    await maybeReportTeamverUsageAfterSave(
      'p1',
      { id: 'm1', role: 'assistant', content: '', runStatus: 'succeeded', runId: 'r1', events: [] },
      { telemetryFinalized: true },
    );
    expect(reportUsage.reportTeamverDesignUsage).not.toHaveBeenCalled();
  });

  it('reports usage once per run in embed mode', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    const message = {
      id: 'm1',
      role: 'assistant' as const,
      content: '',
      runStatus: 'succeeded' as const,
      runId: 'run-abc',
      events: [
        { kind: 'status' as const, label: 'model', detail: 'claude-sonnet-4-5' },
        { kind: 'usage' as const, inputTokens: 100, outputTokens: 50 },
      ],
    };

    await maybeReportTeamverUsageAfterSave('p1', message, { telemetryFinalized: true });
    await maybeReportTeamverUsageAfterSave('p1', message, { telemetryFinalized: true });

    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledTimes(1);
    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledWith({
      workspaceId: 'ws1',
      modelName: 'claude-sonnet-4-5',
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      tokenCountSource: 'provider_usage',
      projectId: 'p1',
      runId: 'run-abc',
      runStatus: 'succeeded',
    });
  });

  it('uses assistant message id as run_id when daemon runId is absent (BYOK)', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    const message = {
      id: 'assistant-msg-42',
      role: 'assistant' as const,
      content: '',
      runStatus: 'succeeded' as const,
      events: [
        { kind: 'usage' as const, inputTokens: 80, outputTokens: 20 },
      ],
    };

    await maybeReportTeamverUsageAfterSave('p1', message, { telemetryFinalized: true });
    await maybeReportTeamverUsageAfterSave('p1', message, { telemetryFinalized: true });

    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledTimes(1);
    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'assistant-msg-42',
        inputTokens: 80,
        outputTokens: 20,
        totalTokens: 100,
      }),
    );
  });

  it('still reports a row for terminal failed/canceled runs (zero tokens, unknown source)', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await maybeReportTeamverUsageAfterSave(
      'p1',
      {
        id: 'm-fail',
        role: 'assistant',
        content: '',
        runStatus: 'failed',
        runId: 'run-fail',
        events: [{ kind: 'status', label: 'model', detail: 'claude-sonnet-4-5' }],
      },
      { telemetryFinalized: true },
    );

    // Even without usage events, billing finalize needs a ledger row for
    // refund/commit_failed status to attach to. The report fires with zero
    // tokens + unknown source so the BE upsert creates the row.
    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        runStatus: 'failed',
        runId: 'run-fail',
        inputTokens: 0,
        outputTokens: 0,
        tokenCountSource: 'unknown',
      }),
    );
  });

  // Closes the loop on the 0-token regression (ATU-FO5LT28NQBB5):
  //   anthropic.ts direct SDK → handlers.onUsage → message.events.push('usage')
  //   → maybeReportTeamverUsageAfterSave → reportTeamverDesignUsage
  // with provider_usage source and cache tokens in separate columns (loop 405).
  it('records non-zero ledger usage when direct Anthropic SDK reports onUsage', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws-embed') },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    // Simulate what ProjectView does after anthropic.ts onUsage fires (loop 405:
    // prompt input separate from cache buckets).
    const message = {
      id: 'assistant-direct-sdk',
      role: 'assistant' as const,
      content: 'hi',
      runStatus: 'succeeded' as const,
      events: [
        { kind: 'status' as const, label: 'model', detail: 'claude-sonnet-4-5' },
        {
          kind: 'usage' as const,
          inputTokens: 137,
          outputTokens: 42,
          cacheReadInputTokens: 200,
          cacheCreationInputTokens: 11,
          model: 'claude-sonnet-4-5-20250929',
          apiProtocol: 'anthropic',
          latencyMs: 1200,
          stopReason: 'end_turn',
        },
      ],
    };

    await maybeReportTeamverUsageAfterSave('p-embed', message, { telemetryFinalized: true });

    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledTimes(1);
    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledWith({
      workspaceId: 'ws-embed',
      modelName: 'claude-sonnet-4-5-20250929',
      inputTokens: 137,
      outputTokens: 42,
      totalTokens: 390,
      tokenCountSource: 'provider_usage',
      projectId: 'p-embed',
      runId: 'assistant-direct-sdk',
      runStatus: 'succeeded',
      cacheReadInputTokens: 200,
      cacheCreationInputTokens: 11,
      providerReportedModel: 'claude-sonnet-4-5-20250929',
      apiProtocol: 'anthropic',
      latencyMs: 1200,
      stopReason: 'end_turn',
    });
  });

  // Loop 391 hardening: concurrent persistMessage retries for the same
  // runId must not fan out into duplicate POSTs while the first is still
  // awaiting the network. Without the inFlight guard a fast-clicking user
  // (or a React StrictMode double-mount) could double-bill via the FE.
  it('does not fan out duplicate POSTs when two concurrent calls share a runId', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws-embed') },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    // Hold the report mock pending so we can race two callers through the
    // function body before either resolves.
    let releaseFirst: (value: string | null) => void = () => {};
    const firstPending = new Promise<string | null>((resolve) => {
      releaseFirst = resolve;
    });
    vi.mocked(reportUsage.reportTeamverDesignUsage)
      .mockImplementationOnce(() => firstPending)
      .mockImplementation(async () => null);

    const message = {
      id: 'assistant-race',
      role: 'assistant' as const,
      content: 'hi',
      runStatus: 'succeeded' as const,
      runId: 'run-race-1',
      events: [{ kind: 'usage' as const, inputTokens: 50, outputTokens: 10 }],
    };

    const pendingA = maybeReportTeamverUsageAfterSave('p1', message, {
      telemetryFinalized: true,
    });
    const pendingB = maybeReportTeamverUsageAfterSave('p1', message, {
      telemetryFinalized: true,
    });

    // Let microtasks run so both calls reach the inFlight guard.
    await Promise.resolve();
    await Promise.resolve();
    releaseFirst(null);
    await Promise.all([pendingA, pendingB]);

    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledTimes(1);

    // Subsequent calls with the same runId still dedupe via reportedRunIds.
    await maybeReportTeamverUsageAfterSave('p1', message, { telemetryFinalized: true });
    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledTimes(1);
  });

  it('caps the in-memory dedupe set so long-lived embed tabs do not leak', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    // Cap is 1024 → push 1025 distinct runs; the oldest (run-0) must roll out
    // and become re-reportable. Newer runs still dedupe.
    const cap = 1024;
    for (let i = 0; i <= cap; i += 1) {
      await maybeReportTeamverUsageAfterSave(
        'p1',
        {
          id: `m-${i}`,
          role: 'assistant',
          content: '',
          runStatus: 'succeeded',
          runId: `run-${i}`,
          events: [{ kind: 'usage', inputTokens: 1, outputTokens: 1 }],
        },
        { telemetryFinalized: true },
      );
    }
    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledTimes(cap + 1);

    // run-0 was evicted (FIFO) → reports again.
    await maybeReportTeamverUsageAfterSave(
      'p1',
      {
        id: 'm-0',
        role: 'assistant',
        content: '',
        runStatus: 'succeeded',
        runId: 'run-0',
        events: [{ kind: 'usage', inputTokens: 1, outputTokens: 1 }],
      },
      { telemetryFinalized: true },
    );
    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledTimes(cap + 2);

    // The most-recent run still dedupes.
    await maybeReportTeamverUsageAfterSave(
      'p1',
      {
        id: `m-${cap}`,
        role: 'assistant',
        content: '',
        runStatus: 'succeeded',
        runId: `run-${cap}`,
        events: [{ kind: 'usage', inputTokens: 1, outputTokens: 1 }],
      },
      { telemetryFinalized: true },
    );
    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledTimes(cap + 2);
  });

  it('reports API-mode usage with requesting label and usage events', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      workspaceStore: { get: vi.fn(async () => 'ws1') },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await maybeReportTeamverUsageAfterSave(
      'p1',
      {
        id: 'm1',
        role: 'assistant',
        content: '',
        runStatus: 'succeeded',
        runId: 'run-api',
        events: [
          { kind: 'status', label: 'requesting', detail: 'claude-sonnet-4-5' },
          { kind: 'usage', inputTokens: 120, outputTokens: 15 },
        ],
      },
      { telemetryFinalized: true },
    );

    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledWith({
      workspaceId: 'ws1',
      modelName: 'claude-sonnet-4-5',
      inputTokens: 120,
      outputTokens: 15,
      totalTokens: 135,
      tokenCountSource: 'provider_usage',
      projectId: 'p1',
      runId: 'run-api',
      runStatus: 'succeeded',
    });
  });
});
