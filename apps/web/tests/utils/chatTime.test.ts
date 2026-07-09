import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '../../src/types';
import { messageTime } from '../../src/utils/chatTime';

describe('messageTime', () => {
  it('uses assistant startedAt before persisted createdAt', () => {
    const message: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Done',
      startedAt: 100,
      createdAt: 200,
      endedAt: 300,
    };

    expect(messageTime(message)).toBe(100);
  });

  it('keeps user createdAt as the primary timestamp', () => {
    const message: ChatMessage = {
      id: 'user-1',
      role: 'user',
      content: 'Build this',
      startedAt: 100,
      createdAt: 200,
    };

    expect(messageTime(message)).toBe(200);
  });

  it('accepts persisted ISO timestamp strings', () => {
    const message = {
      id: 'user-iso',
      role: 'user',
      content: 'Build this',
      createdAt: '2026-07-09T05:30:00.000Z',
    } as unknown as ChatMessage;

    expect(messageTime(message)).toBe(Date.parse('2026-07-09T05:30:00.000Z'));
  });

  it('skips invalid timestamp values so chat rendering does not throw', () => {
    const message = {
      id: 'user-invalid',
      role: 'user',
      content: 'Build this',
      createdAt: 'not-a-date',
      startedAt: Number.NaN,
      endedAt: undefined,
    } as unknown as ChatMessage;

    expect(messageTime(message)).toBeUndefined();
  });
});
