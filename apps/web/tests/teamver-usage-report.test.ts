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
import * as reportUsage from '../src/teamver/reportUsage';

vi.mock('../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

vi.mock('../src/teamver/designBffClient', () => ({
  getDesignBffClient: vi.fn(() => null),
}));

vi.mock('../src/teamver/reportUsage', () => ({
  reportTeamverDesignUsage: vi.fn(async () => 'UREQ-TEST'),
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
      managedApiConfigured: true,
      model: 'claude-sonnet-4-5',
    });
    expect(resolveTeamverUsageModelName([])).toBe('claude-sonnet-4-5');
    resetPinnedTeamverExecutionConfigForTests();
  });

  it('extracts OpenAI nested cache read tokens from provider usage payloads', () => {
    expect(
      extractProviderUsageDetails({
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          prompt_tokens_details: { cached_tokens: 200 },
        },
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 200,
    });
  });

  it('returns unknown when model cannot be resolved', () => {
    resetPinnedTeamverExecutionConfigForTests();
    expect(resolveTeamverUsageModelName([])).toBe('unknown');
  });
});

describe('maybeReportTeamverUsageAfterSave', () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
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

  it('no-ops for embed BYOK — daemon message PUT owns usage + billing (§4.11)', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);

    await maybeReportTeamverUsageAfterSave(
      'p1',
      {
        id: 'assistant-msg-1',
        role: 'assistant',
        content: '',
        runStatus: 'succeeded',
        events: [{ kind: 'usage', inputTokens: 100, outputTokens: 50 }],
      },
      { telemetryFinalized: true },
    );

    expect(reportUsage.reportTeamverDesignUsage).not.toHaveBeenCalled();
  });

  it('no-ops when daemon runId is present (hosted M2M is authoritative)', async () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);

    await maybeReportTeamverUsageAfterSave(
      'p1',
      {
        id: 'm-hosted',
        role: 'assistant',
        content: '',
        runStatus: 'succeeded',
        runId: 'daemon-run-1',
        events: [{ kind: 'usage', inputTokens: 10, outputTokens: 5 }],
      },
      { telemetryFinalized: true },
    );

    expect(reportUsage.reportTeamverDesignUsage).not.toHaveBeenCalled();
  });
});
