import { afterEach, describe, expect, it } from 'vitest';

import {
  isMiniMaxChatTarget,
  resolveMiniMaxBaseUrl,
  resolveMiniMaxChatModel,
  resolveTeamverMiniMaxApiKeyFromEnv,
  shouldOmitMaxTokens,
} from '../src/minimax-runtime.js';

describe('minimax-runtime', () => {
  const prev = {
    TEAMVER_MINIMAX_API_KEY: process.env.TEAMVER_MINIMAX_API_KEY,
    OD_MINIMAX_API_KEY: process.env.OD_MINIMAX_API_KEY,
    MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
    TEAMVER_MINIMAX_BASE_URL: process.env.TEAMVER_MINIMAX_BASE_URL,
    TEAMVER_MINIMAX_CHAT_MODEL: process.env.TEAMVER_MINIMAX_CHAT_MODEL,
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

  it('defaults base URL and normalizes minimaxi.com typo domain', () => {
    delete process.env.TEAMVER_MINIMAX_BASE_URL;
    expect(resolveMiniMaxBaseUrl()).toBe('https://api.minimax.io/v1');
    process.env.TEAMVER_MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1';
    expect(resolveMiniMaxBaseUrl()).toBe('https://api.minimax.io/v1');
  });

  it('defaults chat model to MiniMax-M3', () => {
    delete process.env.TEAMVER_MINIMAX_CHAT_MODEL;
    expect(resolveMiniMaxChatModel()).toBe('MiniMax-M3');
  });

  it('omits max_tokens for MiniMax chat targets', () => {
    expect(shouldOmitMaxTokens('MiniMax-M3')).toBe(true);
    expect(shouldOmitMaxTokens('claude-sonnet-4-6')).toBe(false);
    expect(isMiniMaxChatTarget('x', 'https://api.minimax.io/v1')).toBe(true);
  });
});
