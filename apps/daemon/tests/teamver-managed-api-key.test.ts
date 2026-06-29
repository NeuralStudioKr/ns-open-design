import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';

import {
  proxyApiKeyFailureToErrorCode,
  PROXY_API_KEY_MISSING_ERROR_CODE,
  resolveProxyStreamApiKey,
  resolveProxyStreamApiKeyDetailed,
  resolveTeamverManagedApiKeyFromEnv,
} from '../src/teamver-managed-api-key.js';

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as Request;
}

describe('resolveTeamverManagedApiKeyFromEnv', () => {
  const prevOd = process.env.TEAMVER_OD_API_KEY;
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (prevOd === undefined) delete process.env.TEAMVER_OD_API_KEY;
    else process.env.TEAMVER_OD_API_KEY = prevOd;
    if (prevAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prevAnthropic;
  });

  it('prefers TEAMVER_OD_API_KEY over ANTHROPIC_API_KEY', () => {
    process.env.TEAMVER_OD_API_KEY = 'sk-managed';
    process.env.ANTHROPIC_API_KEY = 'sk-fallback';
    expect(resolveTeamverManagedApiKeyFromEnv()).toBe('sk-managed');
  });
});

describe('resolveProxyStreamApiKey', () => {
  const prevDesignApi = process.env.TEAMVER_DESIGN_API_URL;
  const prevOd = process.env.TEAMVER_OD_API_KEY;

  beforeEach(() => {
    process.env.TEAMVER_DESIGN_API_URL = 'http://design-api:8000';
    process.env.TEAMVER_OD_API_KEY = 'sk-managed';
  });

  afterEach(() => {
    if (prevDesignApi === undefined) delete process.env.TEAMVER_DESIGN_API_URL;
    else process.env.TEAMVER_DESIGN_API_URL = prevDesignApi;
    if (prevOd === undefined) delete process.env.TEAMVER_OD_API_KEY;
    else process.env.TEAMVER_OD_API_KEY = prevOd;
  });

  it('returns client apiKey when provided', () => {
    const key = resolveProxyStreamApiKey(mockReq(), {
      apiKey: 'sk-user',
      useManagedApiKey: true,
    });
    expect(key).toBe('sk-user');
  });

  it('resolves managed key when useManagedApiKey and teamver identity present', () => {
    const key = resolveProxyStreamApiKey(
      mockReq({
        'x-teamver-user-id': 'user-1',
        'x-workspace-id': 'ws-1',
      }),
      { useManagedApiKey: true },
    );
    expect(key).toBe('sk-managed');
  });

  it('rejects managed key without teamver identity headers', () => {
    const key = resolveProxyStreamApiKey(mockReq(), { useManagedApiKey: true });
    expect(key).toBeNull();
  });

  it('resolveProxyStreamApiKeyDetailed surfaces managed_key_env_missing', () => {
    delete process.env.TEAMVER_OD_API_KEY;
    const result = resolveProxyStreamApiKeyDetailed(
      mockReq({
        'x-teamver-user-id': 'user-1',
        'x-workspace-id': 'ws-1',
      }),
      { useManagedApiKey: true },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toEqual({ reason: 'managed_key_env_missing' });
    const mapped = proxyApiKeyFailureToErrorCode(result.failure);
    expect(mapped.code).toBe(PROXY_API_KEY_MISSING_ERROR_CODE);
    expect(mapped.httpStatus).toBe(503);
  });
});
