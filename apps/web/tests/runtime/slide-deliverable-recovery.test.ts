import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '../../src/types';
import {
  AUTO_CONTINUE_PROMPT_SENTINEL,
  AUTO_CONTINUE_STATUS_CODE,
} from '../../src/runtime/resume';
import {
  canFireAutoContinueForConversation,
  collectSlideReferencePathsFromMessages,
  countAutoContinueAttemptsInConversation,
  extractRequestedSlideCountHintFromMessages,
  findIncompleteSlideAssistantForRecovery,
  parseSlideCountPhrase,
  syncAutoContinueCountFromMessages,
  verifySlideProducedHtmlDeliverable,
  attemptEmergencySlideDeckRecovery,
} from '../../src/runtime/slide-deliverable-recovery';

const INCOMPLETE_SHELL = '<!doctype html><html><head><meta charset="utf-8"></head><body></body>';
const VALID_DECK =
  '<!doctype html><html><body><section class="slide"><h1>제목</h1><p>본문</p></section></body></html>';

function assistantMessage(
  id: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: '슬라이드 구성',
    createdAt: 1,
    runStatus: 'failed',
    resumable: true,
    events: [{ kind: 'status', label: 'error', detail: 'missing', code: 'incomplete_output' }],
    ...overrides,
  };
}

describe('countAutoContinueAttemptsInConversation', () => {
  it('counts hidden auto-continue user rows only', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'make slides', createdAt: 1 },
      assistantMessage('a1', {
        events: [{ kind: 'status', label: 'error', detail: 'x', code: AUTO_CONTINUE_STATUS_CODE }],
      }),
      {
        id: 'u2',
        role: 'user',
        content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\ncontinue`,
        createdAt: 2,
      },
      { id: 'a2', role: 'assistant', content: 'still incomplete', createdAt: 3 },
    ];
    expect(countAutoContinueAttemptsInConversation(messages)).toBe(1);
  });
});

describe('collectSlideReferencePathsFromMessages', () => {
  it('collects uploaded reference paths from attachments and hidden prompt text', () => {
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content:
          '발표 대본 참고해서 ppt 디자인 해줘\n\n[Deliverable instruction]\n'
          + 'Reference files to read/use:\n- refs/drive/course-script.md',
        createdAt: 1,
        attachments: [
          { path: 'refs/drive/course-script.md', name: 'course-script.md', kind: 'file' },
          { path: 'refs/uploads/brief.pdf', name: 'brief.pdf', kind: 'file' },
        ],
      },
      assistantMessage('a1'),
    ];

    expect(collectSlideReferencePathsFromMessages(messages)).toEqual([
      'refs/drive/course-script.md',
      'refs/uploads/brief.pdf',
    ]);
  });

  it('preserves Drive reference paths with spaces when only hidden text is available', () => {
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content:
          '첨부한 발표 대본 참고해서 슬라이드 만들어줘\n\n[Deliverable instruction]\n'
          + 'Reference files to read/use:\n'
          + '- refs/drive/mrvw6xvt-앤트릴 현상 발표 대본.md',
        createdAt: 1,
      },
      assistantMessage('a1'),
    ];

    expect(collectSlideReferencePathsFromMessages(messages)).toEqual([
      'refs/drive/mrvw6xvt-앤트릴 현상 발표 대본.md',
    ]);
  });
});

describe('parseSlideCountPhrase', () => {
  it('parses single and ranged slide counts', () => {
    expect(parseSlideCountPhrase('10장 슬라이드')).toContain('정확히 10장');
    expect(parseSlideCountPhrase('8~10장')).toContain('정확히 10장');
    expect(parseSlideCountPhrase('10-15 pages')).toContain('정확히 15장');
  });
});

describe('extractRequestedSlideCountHintFromMessages', () => {
  it('reads slideCount from plugin inputs and form answers', () => {
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: '신입사원 온보딩 슬라이드\n\n[Deliverable instruction]\nslideCount: "12장"',
        createdAt: 1,
      },
      assistantMessage('a1'),
    ];
    expect(extractRequestedSlideCountHintFromMessages(messages)).toContain('정확히 12장');
  });

  it('prefers the latest non-auto-continue user turn', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: '8장짜리 덱', createdAt: 1 },
      {
        id: 'u2',
        role: 'user',
        content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\nretry`,
        createdAt: 2,
      },
      { id: 'u3', role: 'user', content: '15 slides for executives', createdAt: 3 },
      assistantMessage('a1'),
    ];
    expect(extractRequestedSlideCountHintFromMessages(messages)).toContain('정확히 15장');
  });
});

describe('syncAutoContinueCountFromMessages', () => {
  it('writes the user-message-derived count into the ref map', () => {
    const counts = new Map<string, number>();
    const messages: ChatMessage[] = [
      {
        id: 'u-auto',
        role: 'user',
        content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\nretry`,
        createdAt: 1,
      },
    ];
    expect(syncAutoContinueCountFromMessages(counts, 'conv-1', messages)).toBe(1);
    expect(counts.get('conv-1')).toBe(1);
  });
});

describe('findIncompleteSlideAssistantForRecovery', () => {
  it('returns the latest failed incomplete assistant when no auto-continue followed', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'deck', createdAt: 1 },
      assistantMessage('a1'),
    ];
    expect(findIncompleteSlideAssistantForRecovery(messages)?.id).toBe('a1');
  });

  it('skips when an auto-continue user row already exists after the failure', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'deck', createdAt: 1 },
      assistantMessage('a1'),
      {
        id: 'u-auto',
        role: 'user',
        content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\ncontinue`,
        createdAt: 2,
      },
      { id: 'a2', role: 'assistant', content: 'streaming', createdAt: 3, runStatus: 'running' },
    ];
    expect(findIncompleteSlideAssistantForRecovery(messages)).toBeNull();
  });

  it('does not recover an older assistant when a newer assistant row exists', () => {
    const messages: ChatMessage[] = [
      assistantMessage('a1'),
      {
        id: 'a2',
        role: 'assistant',
        content: 'ok',
        createdAt: 2,
        runStatus: 'succeeded',
      },
    ];
    expect(findIncompleteSlideAssistantForRecovery(messages)).toBeNull();
  });
});

describe('canFireAutoContinueForConversation', () => {
  it('allows attempts below the cap', () => {
    expect(canFireAutoContinueForConversation(0)).toBe(true);
    expect(canFireAutoContinueForConversation(2)).toBe(true);
    expect(canFireAutoContinueForConversation(3)).toBe(false);
  });
});

describe('verifySlideProducedHtmlDeliverable', () => {
  it('returns the file name when disk HTML is previewable', async () => {
    await expect(
      verifySlideProducedHtmlDeliverable('deck.html', async () => VALID_DECK),
    ).resolves.toBe('deck.html');
  });

  it('returns null for incomplete shell files on disk', async () => {
    await expect(
      verifySlideProducedHtmlDeliverable('deck.html', async () => INCOMPLETE_SHELL),
    ).resolves.toBeNull();
  });
});

describe('attemptEmergencySlideDeckRecovery', () => {
  it('trusts a successful emergency persist even when immediate read verification lags', async () => {
    const result = await attemptEmergencySlideDeckRecovery({
      slideOnlyMvp: true,
      producedHtmlToOpen: null,
      outlineMessages: [
        { id: 'u1', role: 'user', content: 'AI 도입 효과 발표 자료 만들어줘', createdAt: 1 },
        {
          id: 'a1',
          role: 'assistant',
          content:
            '슬라이드 구성:\n'
            + '01 표지\n'
            + '02 배경\n'
            + '03 생산성\n'
            + '04 비용 절감\n'
            + '05 실행 방안\n'
            + '06 마무리',
          createdAt: 2,
        },
      ],
      finalText: '슬라이드 구성을 바탕으로 덱을 준비했습니다.',
      projectFiles: [],
      beforeFileNames: [],
      startedAt: 1,
      persistArtifact: async () => ({ kind: 'persisted', fileName: 'deck.html' }),
      refreshProjectFiles: async () => [],
      readProjectHtml: async () => null,
      computeProducedFiles: () => [],
    });

    expect(result.recovered).toBe(true);
    expect(result.htmlToOpen).toBe('deck.html');
  });
});
