import { afterEach, describe, expect, it } from 'vitest';

import {
  MINIMAX_DEFAULT_BASE_URL,
  MINIMAX_DEFAULT_CHAT_MODEL,
  MINIMAX_M3_MAX_COMPLETION_TOKENS,
  MINIMAX_M3_RECOMMENDED_MAX_COMPLETION_TOKENS,
  MINIMAX_M3_RECOMMENDED_TEMPERATURE,
  MINIMAX_M3_RECOMMENDED_TOP_P,
  buildMiniMaxChatCompletionExtras,
  isMiniMaxChatTarget,
  normalizeMiniMaxBaseUrl,
  resolveMiniMaxBaseUrl,
  resolveMiniMaxChatModel,
  resolveMiniMaxMaxCompletionTokens,
  resolveMiniMaxThinkingType,
  resolveMiniMaxToolLoopLimit,
  resolveTeamverMiniMaxApiKeyFromEnv,
  shouldOmitMaxTokens,
  shouldOmitMiniMaxMaxTokens,
  minimaxTurnShouldEnableWebFetch,
} from '../src/minimax-runtime.js';

describe('minimax-runtime', () => {
  const prev = {
    TEAMVER_MINIMAX_API_KEY: process.env.TEAMVER_MINIMAX_API_KEY,
    OD_MINIMAX_API_KEY: process.env.OD_MINIMAX_API_KEY,
    MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
    TEAMVER_MINIMAX_BASE_URL: process.env.TEAMVER_MINIMAX_BASE_URL,
    TEAMVER_MINIMAX_CHAT_MODEL: process.env.TEAMVER_MINIMAX_CHAT_MODEL,
    TEAMVER_AI_TOOL_LOOP_LIMIT: process.env.TEAMVER_AI_TOOL_LOOP_LIMIT,
    TEAMVER_MINIMAX_MAX_COMPLETION_TOKENS: process.env.TEAMVER_MINIMAX_MAX_COMPLETION_TOKENS,
    TEAMVER_MINIMAX_THINKING: process.env.TEAMVER_MINIMAX_THINKING,
    TEAMVER_MINIMAX_TEMPERATURE: process.env.TEAMVER_MINIMAX_TEMPERATURE,
    TEAMVER_MINIMAX_TOP_P: process.env.TEAMVER_MINIMAX_TOP_P,
    TEAMVER_MINIMAX_SERVICE_TIER: process.env.TEAMVER_MINIMAX_SERVICE_TIER,
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

  it('sends the official MiniMax-M3 recommended output cap and clamps to 32K–512K', () => {
    delete process.env.TEAMVER_MINIMAX_MAX_COMPLETION_TOKENS;
    expect(resolveMiniMaxMaxCompletionTokens()).toBe(MINIMAX_M3_RECOMMENDED_MAX_COMPLETION_TOKENS);
    expect(resolveMiniMaxMaxCompletionTokens(4096)).toBe(32_000);
    expect(resolveMiniMaxMaxCompletionTokens(600_000)).toBe(MINIMAX_M3_MAX_COMPLETION_TOKENS);
    process.env.TEAMVER_MINIMAX_MAX_COMPLETION_TOKENS = '65536';
    expect(resolveMiniMaxMaxCompletionTokens()).toBe(65_536);
    process.env.TEAMVER_MINIMAX_MAX_COMPLETION_TOKENS = '1024';
    expect(resolveMiniMaxMaxCompletionTokens()).toBe(32_000);
    process.env.TEAMVER_MINIMAX_MAX_COMPLETION_TOKENS = '999999';
    expect(resolveMiniMaxMaxCompletionTokens()).toBe(MINIMAX_M3_MAX_COMPLETION_TOKENS);
  });

  it('defaults MiniMax thinking to disabled so deck HTML is not starved', () => {
    delete process.env.TEAMVER_MINIMAX_THINKING;
    expect(resolveMiniMaxThinkingType()).toBe('disabled');
    process.env.TEAMVER_MINIMAX_THINKING = 'adaptive';
    expect(resolveMiniMaxThinkingType()).toBe('adaptive');
    process.env.TEAMVER_MINIMAX_THINKING = 'enabled';
    expect(resolveMiniMaxThinkingType()).toBe('adaptive');
  });

  it('builds official MiniMax-M3 extras: recommended sampling, usage, no think leak', () => {
    delete process.env.TEAMVER_MINIMAX_THINKING;
    delete process.env.TEAMVER_MINIMAX_TEMPERATURE;
    delete process.env.TEAMVER_MINIMAX_TOP_P;
    delete process.env.TEAMVER_MINIMAX_SERVICE_TIER;
    process.env.TEAMVER_MINIMAX_TEMPERATURE = '';
    process.env.TEAMVER_MINIMAX_TOP_P = '  ';
    const extras = buildMiniMaxChatCompletionExtras();
    expect(extras.max_completion_tokens).toBe(MINIMAX_M3_RECOMMENDED_MAX_COMPLETION_TOKENS);
    expect(extras.thinking).toEqual({ type: 'disabled' });
    expect(extras.temperature).toBe(MINIMAX_M3_RECOMMENDED_TEMPERATURE);
    expect(extras.top_p).toBe(MINIMAX_M3_RECOMMENDED_TOP_P);
    expect(extras.stream_options).toEqual({ include_usage: true });
    expect(extras).not.toHaveProperty('reasoning_split');
    expect(extras).not.toHaveProperty('service_tier');

    process.env.TEAMVER_MINIMAX_THINKING = 'adaptive';
    process.env.TEAMVER_MINIMAX_SERVICE_TIER = 'priority';
    const thinkingOn = buildMiniMaxChatCompletionExtras({ includeUsage: false });
    expect(thinkingOn.thinking).toEqual({ type: 'adaptive' });
    expect(thinkingOn.reasoning_split).toBe(true);
    expect(thinkingOn.service_tier).toBe('priority');
    expect(thinkingOn).not.toHaveProperty('stream_options');
  });

  it('enables MiniMax web_fetch only for real page URLs or tool-loop follow-ups', () => {
    expect(minimaxTurnShouldEnableWebFetch([{ role: 'user', content: '슬라이드 만들어줘' }])).toBe(
      false,
    );
    expect(
      minimaxTurnShouldEnableWebFetch(
        [{ role: 'user', content: 'hello' }],
        "@import url('https://fonts.googleapis.com/css2?family=Fredoka');",
      ),
    ).toBe(false);
    expect(
      minimaxTurnShouldEnableWebFetch([
        { role: 'user', content: 'www.teamver.com 참고해서 슬라이드 만들어줘' },
      ]),
    ).toBe(true);
    expect(
      minimaxTurnShouldEnableWebFetch([
        { role: 'tool', content: 'page text' },
      ]),
    ).toBe(true);
  });
});
