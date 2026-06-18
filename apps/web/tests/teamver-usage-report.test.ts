import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extractLatestUsageFromEvents,
  extractModelNameFromEvents,
  isTerminalRunStatus,
} from '../src/teamver/usageAttribution';
import { maybeReportTeamverUsageAfterSave } from '../src/teamver/maybeReportTeamverUsageAfterSave';
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
    ).toEqual({ inputTokens: 99, outputTokens: 1 });
  });

  it('extracts model name from status events', () => {
    expect(
      extractModelNameFromEvents([
        { kind: 'status', label: 'model', detail: 'claude-sonnet-4-5' },
      ]),
    ).toBe('claude-sonnet-4-5');
  });
});

describe('maybeReportTeamverUsageAfterSave', () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);
    vi.mocked(reportUsage.reportTeamverDesignUsage).mockClear();
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
      projectId: 'p1',
      runId: 'run-abc',
    });
  });
});
