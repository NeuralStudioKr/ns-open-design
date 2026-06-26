import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkError } from '@teamver/app-sdk';

import { reportTeamverDesignUsage } from '../src/teamver/reportUsage';
import * as designBffClient from '../src/teamver/designBffClient';

vi.mock('../src/teamver/designBffClient', () => ({
  getDesignBffClient: vi.fn(() => null),
  withDesignBffCookieAuthRecovery: vi.fn((request: () => Promise<unknown>) => request()),
}));

describe('reportTeamverDesignUsage', () => {
  afterEach(() => {
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue(null);
  });

  it('no-ops outside Teamver embed mode when the design BFF client is unavailable', async () => {
    const requestId = await reportTeamverDesignUsage({
      workspaceId: 'ws-default',
      modelName: 'claude-sonnet-4-5',
      inputTokens: 3,
      outputTokens: 5,
      projectId: 'od-default',
      runId: 'run-default',
    });

    expect(requestId).toBeNull();
    expect(designBffClient.getDesignBffClient).toHaveBeenCalledOnce();
  });

  it('returns the accepted request id from design-api', async () => {
    const post = vi.fn(async () => ({ accepted: true, requestId: 'UREQ-123' }));
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      http: { post },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    const requestId = await reportTeamverDesignUsage({
      workspaceId: 'ws-1',
      modelName: 'claude-sonnet-4-5',
      inputTokens: 1,
      outputTokens: 2,
      projectId: 'od-1',
      runId: 'run-1',
    });

    expect(requestId).toBe('UREQ-123');
    expect(post).toHaveBeenCalledWith(
      '/usage/events',
      expect.objectContaining({
        workspaceId: 'ws-1',
        modelName: 'claude-sonnet-4-5',
        inputTokens: 1,
        outputTokens: 2,
        tokenCountSource: 'unknown',
      }),
      expect.objectContaining({
        workspaceId: 'ws-1',
        skipAuthHeader: true,
      }),
    );
  });

  it('forwards tokenCountSource when provided', async () => {
    const post = vi.fn(async () => ({ accepted: true, requestId: 'UREQ-456' }));
    vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
      http: { post },
    } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

    await reportTeamverDesignUsage({
      workspaceId: 'ws-1',
      modelName: 'claude-sonnet-4-5',
      inputTokens: 10,
      outputTokens: 20,
      tokenCountSource: 'provider_usage',
    });

    expect(post).toHaveBeenCalledWith(
      '/usage/events',
      expect.objectContaining({ tokenCountSource: 'provider_usage' }),
      expect.any(Object),
    );
  });

  describe('error observability', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('emits a structured client-error marker on non-retryable client drop', async () => {
      const post = vi.fn(async () => {
        throw new Error('network down');
      });
      vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
        http: { post },
      } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

      const requestId = await reportTeamverDesignUsage({
        workspaceId: 'ws-1',
        modelName: 'claude-sonnet-4-5',
        inputTokens: 5,
        outputTokens: 3,
        runId: 'run-drop',
        runStatus: 'succeeded',
      });

      expect(requestId).toBeNull();
      expect(post).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(warnSpy.mock.calls[0][0] as string);
      expect(payload).toMatchObject({
        metric: 'teamver_usage_client_error',
        stage: 'usage.events_client_drop',
        workspaceId: 'ws-1',
        runId: 'run-drop',
        runStatus: 'succeeded',
        modelName: 'claude-sonnet-4-5',
      });
    });

    it('retries once on generic network Error', async () => {
      const post = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({ accepted: true, requestId: 'UREQ-retry' });
      vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
        http: { post },
      } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

      const requestId = await reportTeamverDesignUsage({
        workspaceId: 'ws-1',
        modelName: 'claude-sonnet-4-5',
        inputTokens: 5,
        outputTokens: 3,
      });

      expect(requestId).toBe('UREQ-retry');
      expect(post).toHaveBeenCalledTimes(2);
    });

    it('retries once on 5xx NetworkError and emits the retry-drop marker on final failure', async () => {
      const post = vi.fn(async () => {
        throw new NetworkError({ status: 503, message: 'busy' });
      });
      vi.mocked(designBffClient.getDesignBffClient).mockReturnValue({
        http: { post },
      } as unknown as ReturnType<typeof designBffClient.getDesignBffClient>);

      const requestId = await reportTeamverDesignUsage({
        workspaceId: 'ws-1',
        modelName: 'claude-sonnet-4-5',
        inputTokens: 5,
        outputTokens: 3,
        runId: 'run-retry',
      });

      expect(requestId).toBeNull();
      expect(post).toHaveBeenCalledTimes(2);
      const payload = JSON.parse(warnSpy.mock.calls[0][0] as string);
      expect(payload.stage).toBe('usage.events_client_retry_drop');
    });
  });
});
