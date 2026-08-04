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
  shouldOmitMiniMaxMaxTokens,
} from '../src/minimax-runtime.js';

describe('minimax-runtime', () => {
  const prevTeamverKey = process.env.TEAMVER_MINIMAX_API_KEY;
  const prevOdKey = process.env.OD_MINIMAX_API_KEY;
  const prevMiniMaxKey = process.env.MINIMAX_API_KEY;
  const prevBaseUrl = process.env.TEAMVER_MINIMAX_BASE_URL;
  const prevModel = process.env.TEAMVER_MINIMAX_CHAT_MODEL;
  const prevToolLimit = process.env.TEAMVER_AI_TOOL_LOOP_LIMIT;

  afterEach(() => {
    if (prevTeamverKey === undefined) delete process.env.TEAMVER_MINIMAX_API_KEY;
    else process.env.TEAMVER_MINIMAX_API_KEY = prevTeamverKey;
    if (prevOdKey === undefined) delete process.env.OD_MINIMAX_API_KEY;
    else process.env.OD_MINIMAX_API_KEY = prevOdKey;
    if (prevMiniMaxKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = prevMiniMaxKey;
    if (prevBaseUrl === undefined) delete process.env.TEAMVER_MINIMAX_BASE_URL;
    else process.env.TEAMVER_MINIMAX_BASE_URL = prevBaseUrl;
    if (prevModel === undefined) delete process.env.TEAMVER_MINIMAX_CHAT_MODEL;
    else process.env.TEAMVER_MINIMAX_CHAT_MODEL = prevModel;
    if (prevToolLimit === undefined) delete process.env.TEAMVER_AI_TOOL_LOOP_LIMIT;
    else process.env.TEAMVER_AI_TOOL_LOOP_LIMIT = prevToolLimit;
  });

  it('prefers TEAMVER_MINIMAX_API_KEY over compatibility aliases', () => {
    process.env.TEAMVER_MINIMAX_API_KEY = 'sk-cp-teamver';
    process.env.OD_MINIMAX_API_KEY = 'sk-cp-od';
    process.env.MINIMAX_API_KEY = 'sk-cp-plain';

    expect(resolveTeamverMiniMaxApiKeyFromEnv()).toBe('sk-cp-teamver');
  });

  it('falls back to OD_MINIMAX_API_KEY then MINIMAX_API_KEY', () => {
    delete process.env.TEAMVER_MINIMAX_API_KEY;
    process.env.OD_MINIMAX_API_KEY = 'sk-cp-od';
    process.env.MINIMAX_API_KEY = 'sk-cp-plain';
    expect(resolveTeamverMiniMaxApiKeyFromEnv()).toBe('sk-cp-od');

    delete process.env.OD_MINIMAX_API_KEY;
    expect(resolveTeamverMiniMaxApiKeyFromEnv()).toBe('sk-cp-plain');
  });

  it('resolves MiniMax defaults without env', () => {
    delete process.env.TEAMVER_MINIMAX_BASE_URL;
    delete process.env.TEAMVER_MINIMAX_CHAT_MODEL;

    expect(resolveMiniMaxBaseUrl()).toBe(MINIMAX_DEFAULT_BASE_URL);
    expect(resolveMiniMaxChatModel()).toBe(MINIMAX_DEFAULT_CHAT_MODEL);
  });

  it('normalizes legacy MiniMax gateway hostnames to minimax.io', () => {
    expect(normalizeMiniMaxBaseUrl('https://api.minimaxi.com/v1/')).toBe(
      MINIMAX_DEFAULT_BASE_URL,
    );
    expect(normalizeMiniMaxBaseUrl('https://api.minimaxi.chat/v1/')).toBe(
      MINIMAX_DEFAULT_BASE_URL,
    );
  });

  it('detects MiniMax chat targets and max_tokens omission', () => {
    expect(isMiniMaxChatTarget('MiniMax-M3', '')).toBe(true);
    expect(isMiniMaxChatTarget('other-model', 'https://api.minimax.io/v1')).toBe(true);
    expect(shouldOmitMiniMaxMaxTokens('MiniMax-M3')).toBe(true);
    expect(shouldOmitMiniMaxMaxTokens('claude-sonnet-4-5', 'https://api.anthropic.com')).toBe(false);
  });

  it('caps tool loop limit to a conservative range', () => {
    process.env.TEAMVER_AI_TOOL_LOOP_LIMIT = '5';
    expect(resolveMiniMaxToolLoopLimit()).toBe(5);

    process.env.TEAMVER_AI_TOOL_LOOP_LIMIT = '99';
    expect(resolveMiniMaxToolLoopLimit()).toBe(3);
  });
});
