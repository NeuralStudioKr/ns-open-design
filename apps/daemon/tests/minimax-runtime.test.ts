import { afterEach, describe, expect, it } from 'vitest';

import {
  MINIMAX_DEFAULT_BASE_URL,
  MINIMAX_DEFAULT_CHAT_MODEL,
  isMiniMaxChatTarget,
  normalizeMiniMaxBaseUrl,
  resolveMiniMaxBaseUrl,
  resolveMiniMaxChatModel,
  resolveMiniMaxToolLoopLimit,
  resolveTeamverMiniMaxApiKeyFromEnv,
  shouldOmitMaxTokens,
  shouldOmitMiniMaxMaxTokens,
} from '../src/minimax-runtime.js';

describe('minimax-runtime', () => {
  const prev = {
    TEAMVER_MINIMAX_API_KEY: process.env.TEAMVER_MINIMAX_API_KEY,
    OD_MINIMAX_API_KEY: process.env.OD_MINIMAX_API_KEY,
    MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
    TEAMVER_MINIMAX_BASE_URL: process.env.TEAMVER_MINIMAX_BASE_URL,
    TEAMVER_MINIMAX_CHAT_MODEL: process.env.TEAMVER_MINIMAX_CHAT_MODEL,
    TEAMVER_AI_TOOL_LOOP_LIMIT: process.env.TEAMVER_AI_TOOL_LOOP_LIMIT,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('resolves TEAMVER_MINIMAX_API_KEY before aliases', () => {
    process.env.TEAMVER_MINIMAX_API_KEY = 'sk-teamver';
    process.env.OD_MINIMAX_API_KEY = 'sk-od';
    process.env.MINIMAX_API_KEY = 'sk-raw';
    expect(resolveTeamverMiniMaxApiKeyFromEnv()).toBe('sk-teamver');
  });

  it('falls back through OD then MINIMAX aliases', () => {
    delete process.env.TEAMVER_MINIMAX_API_KEY;
    process.env.OD_MINIMAX_API_KEY = 'sk-od';
    process.env.MINIMAX_API_KEY = 'sk-raw';
    expect(resolveTeamverMiniMaxApiKeyFromEnv()).toBe('sk-od');
    delete process.env.OD_MINIMAX_API_KEY;
    expect(resolveTeamverMiniMaxApiKeyFromEnv()).toBe('sk-raw');
  });

  it('defaults base URL and normalizes legacy MiniMax gateway hostnames', () => {
    delete process.env.TEAMVER_MINIMAX_BASE_URL;
    expect(resolveMiniMaxBaseUrl()).toBe(MINIMAX_DEFAULT_BASE_URL);
    expect(normalizeMiniMaxBaseUrl('https://api.minimaxi.com/v1/')).toBe(MINIMAX_DEFAULT_BASE_URL);
    expect(normalizeMiniMaxBaseUrl('https://api.minimaxi.chat/v1/')).toBe(MINIMAX_DEFAULT_BASE_URL);
    process.env.TEAMVER_MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1';
    expect(resolveMiniMaxBaseUrl()).toBe('https://api.minimax.io/v1');
  });

  it('defaults chat model to MiniMax-M3', () => {
    delete process.env.TEAMVER_MINIMAX_CHAT_MODEL;
    expect(resolveMiniMaxChatModel()).toBe(MINIMAX_DEFAULT_CHAT_MODEL);
  });

  it('detects MiniMax chat targets and max_tokens omission', () => {
    expect(isMiniMaxChatTarget('MiniMax-M3', '')).toBe(true);
    expect(isMiniMaxChatTarget('other-model', 'https://api.minimax.io/v1')).toBe(true);
    expect(shouldOmitMaxTokens('MiniMax-M3')).toBe(true);
    expect(shouldOmitMiniMaxMaxTokens('MiniMax-M3')).toBe(true);
    expect(shouldOmitMaxTokens('claude-sonnet-4-6')).toBe(false);
    expect(shouldOmitMiniMaxMaxTokens('claude-sonnet-4-5', 'https://api.anthropic.com')).toBe(false);
  });

  it('caps tool loop limit to a conservative range', () => {
    process.env.TEAMVER_AI_TOOL_LOOP_LIMIT = '5';
    expect(resolveMiniMaxToolLoopLimit()).toBe(5);

    process.env.TEAMVER_AI_TOOL_LOOP_LIMIT = '99';
    expect(resolveMiniMaxToolLoopLimit()).toBe(3);
  });
});
