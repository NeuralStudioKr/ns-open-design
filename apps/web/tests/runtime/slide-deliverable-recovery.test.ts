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
  findIncompleteSlideAssistantForRecovery,
  syncAutoContinueCountFromMessages,
  verifySlideProducedHtmlDeliverable,
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
