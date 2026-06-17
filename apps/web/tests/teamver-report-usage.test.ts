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
      workspace_id: 'ws-default',
      model_name: 'claude-sonnet-4-5',
      input_tokens: 3,
      output_tokens: 5,
      project_id: 'od-default',
      run_id: 'run-default',
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
      workspace_id: 'ws-1',
      model_name: 'claude-sonnet-4-5',
      input_tokens: 1,
      output_tokens: 2,
      project_id: 'od-1',
      run_id: 'run-1',
    });

    expect(requestId).toBe('UREQ-123');
    expect(post).toHaveBeenCalledWith(
      '/usage/events',
      expect.objectContaining({
        workspaceId: 'ws-1',
        modelName: 'claude-sonnet-4-5',
        inputTokens: 1,
        outputTokens: 2,
      }),
      expect.objectContaining({
        workspaceId: 'ws-1',
        skipAuthHeader: true,
      }),
    );
  });
});
