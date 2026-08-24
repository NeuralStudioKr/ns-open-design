import { describe, expect, it } from 'vitest';
import {
  BYOK_CHAT_TOOL_NAMES,
  FAST_MODEL_BY_PROTOCOL,
  MINIMAX_BYOK_CHAT_TOOL_NAMES,
  SUGGESTED_MODELS_BY_PROTOCOL,
  byokChatToolNamesForProtocol,
} from '../../src/state/apiProtocols';

describe('apiProtocols table consistency', () => {
  it('FAST_MODEL_BY_PROTOCOL.google is one of the live suggested models', () => {
    expect(SUGGESTED_MODELS_BY_PROTOCOL.google).toContain(FAST_MODEL_BY_PROTOCOL.google);
  });

  it('advertises daemon BYOK tools only for protocols with the tool-loop proxy', () => {
    expect(byokChatToolNamesForProtocol('senseaudio')).toBe(BYOK_CHAT_TOOL_NAMES);
    expect(byokChatToolNamesForProtocol('aihubmix')).toBe(BYOK_CHAT_TOOL_NAMES);
    expect(byokChatToolNamesForProtocol('minimax')).toBe(MINIMAX_BYOK_CHAT_TOOL_NAMES);
    expect(byokChatToolNamesForProtocol('minimax')).toEqual(['web_fetch']);
    expect(byokChatToolNamesForProtocol('anthropic')).toBeUndefined();
    expect(byokChatToolNamesForProtocol('openai')).toBeUndefined();
    expect(byokChatToolNamesForProtocol('google')).toBeUndefined();
  });

  it('registers MiniMax-M3 as the MiniMax default model', () => {
    expect(SUGGESTED_MODELS_BY_PROTOCOL.minimax).toContain('MiniMax-M3');
    expect(FAST_MODEL_BY_PROTOCOL.minimax).toBe('MiniMax-M3');
  });
});
