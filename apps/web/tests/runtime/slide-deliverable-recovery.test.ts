import { describe, expect, it, vi } from 'vitest';

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
  resolveSlideProducedHtmlToOpen,
  syncAutoContinueCountFromMessages,
  verifySlideProducedHtmlDeliverable,
  attemptEmergencySlideDeckRecovery,
  recoverEmergencyDeckHtmlFromStream,
  shouldSkipEmergencySlideDeckRecoveryForScopedCommentEdit,
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

  it('resets the count after a later normal user request', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'make slides', createdAt: 1 },
      {
        id: 'u-auto-1',
        role: 'user',
        content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\ncontinue`,
        createdAt: 2,
      },
      {
        id: 'u-auto-2',
        role: 'user',
        content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\ncontinue again`,
        createdAt: 3,
      },
      { id: 'u2', role: 'user', content: '이 요소만 수정해줘', createdAt: 4 },
      {
        id: 'u-auto-3',
        role: 'user',
        content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\nscoped retry`,
        createdAt: 5,
      },
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
    expect(parseSlideCountPhrase('20장')).toBeNull();
  });

  it('루프399: parses bare runContext hints like 8-10', () => {
    expect(parseSlideCountPhrase('8-10')).toContain('정확히 10장');
    expect(parseSlideCountPhrase('8-10 (close this turn)')).toContain('8–10');
    expect(parseSlideCountPhrase('8')).toContain('정확히 8장');
    expect(parseSlideCountPhrase('6 (stability cap for first template fill)')).toBeNull();
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

  it('루프399: reads bare 8-10 from runContext on brief-only turns', () => {
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'www.teamver.com 분석해서 서비스 소개 슬라이드 만들어줘',
        createdAt: 1,
        runContext: { slideCountHint: '8-10' },
      },
      assistantMessage('a1'),
    ];
    expect(extractRequestedSlideCountHintFromMessages(messages)).toContain('정확히 10장');
  });

  it('루프400: prefers visible exact count over runContext range (Spec-aligned)', () => {
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: '정확히 12장으로 만들어줘',
        createdAt: 1,
        runContext: { slideCountHint: '8-10' },
      },
      assistantMessage('a1'),
    ];
    expect(extractRequestedSlideCountHintFromMessages(messages)).toContain('정확히 12장');
    expect(extractRequestedSlideCountHintFromMessages(messages)).not.toContain('8–10');
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

  it('reads 8-10 from runContext after persist stores the brief only', () => {
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
        createdAt: 1,
        runContext: { slideCountHint: '8-10' },
      },
    ];
    expect(extractRequestedSlideCountHintFromMessages(messages)).toContain('8–10');
    expect(extractRequestedSlideCountHintFromMessages(messages)).toContain('정확히 10장');
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

  it('still recovers when only a trailing empty shell follows the incomplete failure', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'deck', createdAt: 1 },
      assistantMessage('a1'),
      {
        id: 'a-shell',
        role: 'assistant',
        content: '',
        createdAt: 2,
        endedAt: 2,
        runStatus: 'succeeded',
        events: [{ kind: 'status', label: 'requesting' }],
      },
    ];
    expect(findIncompleteSlideAssistantForRecovery(messages)?.id).toBe('a1');
  });

  it('still recovers when a trailing in-flight empty shell follows the failure', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'deck', createdAt: 1 },
      assistantMessage('a1'),
      {
        id: 'a-inflight-shell',
        role: 'assistant',
        content: '',
        createdAt: 2,
        runStatus: 'running',
        startedAt: 2,
        events: [{ kind: 'status', label: 'requesting' }],
      },
    ];
    expect(findIncompleteSlideAssistantForRecovery(messages)?.id).toBe('a1');
  });

  it('does not recover when a newer in-flight assistant already has body content', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'deck', createdAt: 1 },
      assistantMessage('a1'),
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        createdAt: 2,
        runStatus: 'running',
        startedAt: 2,
        events: [{ kind: 'text', text: 'retrying deck…' }],
      },
    ];
    expect(findIncompleteSlideAssistantForRecovery(messages)).toBeNull();
  });
});

describe('canFireAutoContinueForConversation', () => {
  it('allows attempts below the cap', () => {
    // Bumped cap from 3 to 5 so Canvas → Slide launches get enough auto
    // retries before surfacing the failure banner; still bounded per
    // conversation and beaten by the manual retry affordance.
    expect(canFireAutoContinueForConversation(0)).toBe(true);
    expect(canFireAutoContinueForConversation(4)).toBe(true);
    expect(canFireAutoContinueForConversation(5)).toBe(false);
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

  it('accepts a one-slide instruction-copy cover after heading heal', async () => {
    const parrotCover =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>expo에 대해서 설명하는 피피티 만들어줘</h1></section>'
      + '</body></html>';
    await expect(
      verifySlideProducedHtmlDeliverable('deck.html', async () => parrotCover),
    ).resolves.toBe('deck.html');
    await expect(
      verifySlideProducedHtmlDeliverable(
        'deck.html',
        async () => parrotCover,
        {
          brief: 'expo에 대해서 설명하는 피피티 만들어줘',
          deckTitle: '슬라이드',
        },
      ),
    ).resolves.toBe('deck.html');
  });

  it('returns null for leftover ib-pitch-book catalog examples', async () => {
    const leftover =
      '<!doctype html><html><body>'
      + '<section class="slide"><h1>A discounted-cash-flow that 영어 회화 표현 공부 팁</h1>'
      + '<p>Hartfield &amp; Co.</p><p>WACC (base)</p><p>Implied EV</p>'
      + '</section></body></html>';
    await expect(
      verifySlideProducedHtmlDeliverable(
        'deck.html',
        async () => leftover,
        {
          brief: '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘',
          deckTitle: '슬라이드',
        },
      ),
    ).resolves.toBeNull();
  });

  it('returns null for Motif-SVG-before-title hangs', async () => {
    const hung =
      '<!doctype html><html lang="ko"><body style="margin:0;background:#F5F0E6">'
      + '<section class="slide slide-title" style="width:1920px;height:1080px">'
      + '<div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">'
      + '<style>.cls-0{fill:#FFFFFF}</style></svg></div></section>'
      + '<section class="slide"><h1>개요</h1><p>내용을 작성하세요</p></section>'
      + '</body></html>';
    await expect(
      verifySlideProducedHtmlDeliverable('deck.html', async () => hung),
    ).resolves.toBeNull();
  });
});

describe('resolveSlideProducedHtmlToOpen', () => {
  it('trusts a successful persist when the file-list refresh has not surfaced the file yet', async () => {
    await expect(
      resolveSlideProducedHtmlToOpen(
        null,
        { kind: 'persisted', fileName: 'deck.html' },
        async () => {
          throw new Error('should not read without a produced file candidate');
        },
      ),
    ).resolves.toBe('deck.html');
  });

  it('trusts a successful persist when immediate read verification lags', async () => {
    await expect(
      resolveSlideProducedHtmlToOpen(
        'deck.html',
        { kind: 'persisted', fileName: 'deck.html' },
        async () => null,
      ),
    ).resolves.toBe('deck.html');
  });

  it('returns null when neither verify nor persist succeeded', async () => {
    await expect(
      resolveSlideProducedHtmlToOpen(
        'deck.html',
        { kind: 'skipped-incomplete', fileName: 'deck.html' },
        async () => null,
      ),
    ).resolves.toBeNull();
  });
});

describe('shouldSkipEmergencySlideDeckRecoveryForScopedCommentEdit', () => {
  it('skips emergency salvage when preview comments pin element scope', () => {
    expect(shouldSkipEmergencySlideDeckRecoveryForScopedCommentEdit(0)).toBe(false);
    expect(shouldSkipEmergencySlideDeckRecoveryForScopedCommentEdit(1)).toBe(true);
  });
});

describe('recoverEmergencyDeckHtmlFromStream', () => {
  it('recovers a closed healable instruction-copy cover', () => {
    const shortParrot =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>슬라이드 만들어줘</h1></section>'
      + '</body></html>';
    expect(recoverEmergencyDeckHtmlFromStream({
      finalText: `작성 중\n${shortParrot}`,
    })).toContain('슬라이드 만들어줘');
    expect(recoverEmergencyDeckHtmlFromStream({
      finalText: `작성 중\n${shortParrot}`,
      healBrief: '슬라이드 만들어줘',
      healTitle: '슬라이드',
    })).toContain('슬라이드 만들어줘');
  });
});

describe('attemptEmergencySlideDeckRecovery', () => {
  it('does not salvage when scoped comment attachments are present', async () => {
    const persistArtifact = vi.fn();
    const result = await attemptEmergencySlideDeckRecovery({
      slideOnlyMvp: true,
      producedHtmlToOpen: null,
      scopedCommentAttachmentCount: 1,
      outlineMessages: [
        { id: 'u1', role: 'user', content: 'edit headline', createdAt: 1 },
        {
          id: 'a1',
          role: 'assistant',
          content:
            '<artifact type="deck" identifier="deck"><!doctype html><html><body>'
            + '<section class="slide"><h1>Title</h1></section></body></html></artifact>',
          createdAt: 2,
        },
      ],
      finalText: 'done',
      projectFiles: [],
      beforeFileNames: [],
      startedAt: 1,
      persistArtifact,
      refreshProjectFiles: async () => [],
      readProjectHtml: async () => null,
      computeProducedFiles: () => [],
    });

    expect(result.recovered).toBe(false);
    expect(persistArtifact).not.toHaveBeenCalled();
  });

  it('does not synthesize an outline skeleton when the stream has no model HTML', async () => {
    const persistArtifact = vi.fn();
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
      persistArtifact,
      refreshProjectFiles: async () => [],
      readProjectHtml: async () => null,
      computeProducedFiles: () => [],
    });

    expect(result.recovered).toBe(false);
    expect(persistArtifact).not.toHaveBeenCalled();
  });

  it('titles emergency persist artifacts from persist heal brief/title', async () => {
    const persistArtifact = vi.fn(async (art: { title?: string }) => {
      expect(art.title).toBe('기업 AI 도입 효과');
      expect(art.title).not.toBe('deck');
      return { kind: 'persisted' as const, fileName: 'deck.html' };
    });
    const result = await attemptEmergencySlideDeckRecovery({
      slideOnlyMvp: true,
      producedHtmlToOpen: null,
      outlineMessages: [
        { id: 'u1', role: 'user', content: '기업 AI 도입 효과를 설명하는 피피티 만들어줘', createdAt: 1 },
        { id: 'a1', role: 'assistant', content: VALID_DECK, createdAt: 2 },
      ],
      finalText: VALID_DECK,
      healBrief: '기업 AI 도입 효과를 설명하는 피피티 만들어줘',
      healTitle: '슬라이드 만들어줘',
      projectFiles: [],
      beforeFileNames: [],
      startedAt: 1,
      persistArtifact,
      refreshProjectFiles: async () => [],
      readProjectHtml: async () => null,
      computeProducedFiles: () => [],
    });
    expect(result.recovered).toBe(true);
    expect(persistArtifact).toHaveBeenCalled();
  });

  it('trusts a successful HTML salvage persist even when immediate read verification lags', async () => {
    const html = [
      '<!doctype html><html lang="ko"><body>',
      '<section class="slide"><h1>AI 도입 효과 발표 자료</h1><p>업무 생산성, 비용 절감, 리스크 관리 효과를 요약합니다.</p></section>',
      '<section class="slide"><h2>도입 배경</h2><p>반복 업무 자동화와 지식 근로자 의사결정 지원을 중심으로 문제를 정의합니다.</p></section>',
      '</body></html>',
    ].join('');
    const result = await attemptEmergencySlideDeckRecovery({
      slideOnlyMvp: true,
      producedHtmlToOpen: null,
      outlineMessages: [
        { id: 'u1', role: 'user', content: 'AI 도입 효과 발표 자료 만들어줘', createdAt: 1 },
        { id: 'a1', role: 'assistant', content: html, createdAt: 2 },
      ],
      finalText: html,
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
    expect(result.produced).toEqual([
      expect.objectContaining({
        name: 'deck.html',
        kind: 'html',
        mime: 'text/html',
      }),
    ]);
  });

  it('recovers a complete streamed deck artifact when outline synthesis would fail', async () => {
    const html = [
      '<!doctype html><html lang="ko"><body>',
      '<section class="slide" style="min-height:100vh"><h1>2026 마케팅 전략</h1></section>',
      '<section class="slide" style="min-height:100vh"><p>스택 통합 완료</p></section>',
      '<style>.slide{min-width:100vw;min-height:100vh}</style>',
      '</body></html>',
    ].join('');
    const finalText = `<artifact type="deck" identifier="deck">${html}</artifact>`;

    const result = await attemptEmergencySlideDeckRecovery({
      slideOnlyMvp: true,
      producedHtmlToOpen: null,
      outlineMessages: [
        { id: 'u1', role: 'user', content: '마케팅 전략 슬라이드 만들어줘', createdAt: 1 },
        { id: 'a1', role: 'assistant', content: finalText, createdAt: 2 },
      ],
      finalText,
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
