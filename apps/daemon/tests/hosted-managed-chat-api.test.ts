import { afterEach, describe, expect, it } from 'vitest';

import {
  HOSTED_MANAGED_CHAT_FLAG,
  HOSTED_MANAGED_CHAT_ROUTE,
  isHostedManagedChatApiEnabled,
  resolveHostedManagedChatRuntime,
  validateHostedManagedChatBody,
} from '../src/hosted-managed-chat-api.js';

describe('hosted managed chat API contract', () => {
  const originalBaseUrl = process.env.TEAMVER_MINIMAX_BASE_URL;
  const originalModel = process.env.TEAMVER_MINIMAX_CHAT_MODEL;

  afterEach(() => {
    if (originalBaseUrl == null) delete process.env.TEAMVER_MINIMAX_BASE_URL;
    else process.env.TEAMVER_MINIMAX_BASE_URL = originalBaseUrl;
    if (originalModel == null) delete process.env.TEAMVER_MINIMAX_CHAT_MODEL;
    else process.env.TEAMVER_MINIMAX_CHAT_MODEL = originalModel;
  });

  it('stays disabled unless its isolated flag is explicitly enabled', () => {
    expect(isHostedManagedChatApiEnabled({})).toBe(false);
    expect(isHostedManagedChatApiEnabled({ [HOSTED_MANAGED_CHAT_FLAG]: '0' })).toBe(false);
    expect(isHostedManagedChatApiEnabled({ [HOSTED_MANAGED_CHAT_FLAG]: 'true' })).toBe(true);
    expect(HOSTED_MANAGED_CHAT_ROUTE).toBe('/api/proxy/chat/stream');
  });

  it('accepts provider-neutral request fields', () => {
    expect(validateHostedManagedChatBody({
      projectId: 'project-1',
      conversationId: 'conversation-1',
      messages: [{ role: 'user', content: 'hello' }],
      maxOutputTokens: 32_000,
      expectCompleteDeckArtifact: true,
    })).toEqual({ ok: true });
  });

  it('rejects every client-controlled routing field', () => {
    expect(validateHostedManagedChatBody({
      apiKey: 'secret',
      useManagedApiKey: true,
      apiProtocol: 'anything',
      provider: 'anything',
      model: 'anything',
      baseUrl: 'https://example.com',
      apiVersion: 'v1',
      maxTokens: 123,
    })).toEqual({
      ok: false,
      fields: [
        'apiKey',
        'useManagedApiKey',
        'apiProtocol',
        'provider',
        'model',
        'baseUrl',
        'apiVersion',
        'maxTokens',
      ],
    });
  });

  it('resolves provider runtime only on the server side', () => {
    process.env.TEAMVER_MINIMAX_BASE_URL = 'https://api.minimaxi.chat/v1';
    process.env.TEAMVER_MINIMAX_CHAT_MODEL = 'private-model';
    expect(resolveHostedManagedChatRuntime()).toEqual({
      providerId: 'minimax',
      baseUrl: 'https://api.minimax.io/v1',
      model: 'private-model',
    });
  });
});
