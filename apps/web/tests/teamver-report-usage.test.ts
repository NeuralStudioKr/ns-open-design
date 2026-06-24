import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportTeamverDesignUsage } from '../src/teamver/reportUsage';
import * as designBffClient from '../src/teamver/designBffClient';

vi.mock('../src/teamver/designBffClient', () => ({
  getDesignBffClient: vi.fn(() => null),
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
});
