import { describe, expect, it } from 'vitest';

import {
  buildDeterministicHomeCreateChatMessages,
} from '../../src/teamver/deterministicHomeCreateChat';

describe('deterministicHomeCreateChat (loop428)', () => {
  it('seeds a user brief and a succeeded assistant note so empty-start UI is skipped', () => {
    const messages = buildDeterministicHomeCreateChatMessages({
      userBrief: 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
      slideCount: 8,
      fileName: 'deck.html',
      now: 1_700_000_000_000,
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content).toContain('teamver.com');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.runStatus).toBe('succeeded');
    expect(messages[1]?.content).toContain('8장');
    expect(messages[1]?.content).toContain('deck.html');
  });

  it('falls back when the brief is empty', () => {
    const messages = buildDeterministicHomeCreateChatMessages({
      userBrief: '   ',
      now: 1,
    });
    expect(messages[0]?.content).toBe('슬라이드를 만들어줘.');
    expect(messages[1]?.content).toContain('슬라이드를 준비했습니다');
  });
});
