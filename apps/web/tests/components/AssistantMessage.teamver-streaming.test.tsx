// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

vi.mock('../../src/teamver/branding/TeamverBrandingProvider', () => ({
  useTeamverBranding: () => ({
    enabled: true,
    hideAssistantModelLabels: true,
    hideAssistantThinkingDetails: true,
    slideOnlyMvp: true,
    title: 'teamver Slide',
  }),
}));

afterEach(() => {
  cleanup();
});

function streamingMessage(content: string): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content,
    runStatus: 'running',
    startedAt: 1700000000,
    events: [{ kind: 'text', text: content } as ChatMessage['events'][number]],
    producedFiles: [],
  } as ChatMessage;
}

function completedMessage(content: string): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content,
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000005,
    events: [{ kind: 'text', text: content } as ChatMessage['events'][number]],
    producedFiles: [
      {
        name: 'deck.html',
        path: 'deck.html',
        size: 1024,
        mtime: 1700000005,
        kind: 'html',
        mime: 'text/html',
      },
    ],
  } as ChatMessage;
}

describe('AssistantMessage Teamver streaming visibility', () => {
  it('shows slide-edit progress copy while a deck-patch artifact streams', () => {
    render(
      <AssistantMessage
        message={streamingMessage(
          '<artifact type="deck-patch" identifier="deck"><section class="slide" data-slide-index="0"><h1>Hi',
        )}
        streaming
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Applying slide updates. Please wait a moment.')).toBeTruthy();
    expect(screen.queryByText('Creating the slide deck now. Please wait a moment.')).toBeNull();
    expect(screen.queryByText('슬라이드 초안을 작성 중입니다. 잠시만 기다려 주세요.')).toBeNull();
  });

  it('uses slide-edit progress copy when a full deck streams on an existing-deck edit turn', () => {
    render(
      <AssistantMessage
        message={{
          ...streamingMessage(
            '<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>Hi',
          ),
          preTurnFileNames: ['deck.html'],
        }}
        streaming
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Applying slide updates. Please wait a moment.')).toBeTruthy();
    expect(screen.queryByText('Creating the slide deck now. Please wait a moment.')).toBeNull();
  });

  it('keeps create progress when only leftover non-deck HTML exists pre-turn', () => {
    render(
      <AssistantMessage
        message={{
          ...streamingMessage(
            '<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>Hi',
          ),
          preTurnFileNames: ['about.html'],
        }}
        streaming
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Creating the slide deck now. Please wait a moment.')).toBeTruthy();
    expect(screen.queryByText('Applying slide updates. Please wait a moment.')).toBeNull();
  });

  it('hides model create-progress prose on edit turns while a full deck streams', () => {
    render(
      <AssistantMessage
        message={{
          ...streamingMessage(
            '슬라이드 초안을 작성 중입니다.\n\n<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>Hi',
          ),
          preTurnFileNames: ['deck.html'],
        }}
        streaming
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Applying slide updates. Please wait a moment.')).toBeTruthy();
    expect(screen.queryByText('슬라이드 초안을 작성 중입니다.')).toBeNull();
  });

  it('replaces model create-completion prose with edit lead on an edit turn', () => {
    render(
      <AssistantMessage
        message={{
          ...completedMessage('슬라이드 초안이 생성되었습니다.'),
          content: '슬라이드 초안이 생성되었습니다.',
          events: [
            {
              kind: 'text',
              text: '슬라이드 초안이 생성되었습니다.',
            } as ChatMessage['events'][number],
          ],
          producedFiles: [
            {
              name: 'deck.html',
              path: 'deck.html',
              size: 2048,
              mtime: 1700000005,
              kind: 'html',
              mime: 'text/html',
            },
          ],
          preTurnFileNames: ['deck.html'],
        }}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Slide updates have been applied.')).toBeTruthy();
    expect(screen.queryByText('슬라이드 초안이 생성되었습니다.')).toBeNull();
    expect(screen.queryByText('The slide deck draft is ready.')).toBeNull();
  });

  it('keeps slide-edit completion copy after an in-place deck-patch turn without producedFiles', () => {
    render(
      <AssistantMessage
        message={{
          ...completedMessage(
            '<artifact type="deck-patch" identifier="deck"><section class="slide" data-slide-index="0"><h1>Hi</h1></section></artifact>',
          ),
          producedFiles: [],
          preTurnFileNames: ['deck.html'],
        }}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Slide updates have been applied.')).toBeTruthy();
    expect(screen.queryByText('The slide deck draft is ready.')).toBeNull();
  });

  it('does not show slide-edit completion copy when a deck-patch turn failed', () => {
    render(
      <AssistantMessage
        message={{
          ...completedMessage(
            '<artifact type="deck-patch" identifier="deck"><section class="slide" data-slide-index="0"><h1>Hi</h1></section></artifact>',
          ),
          runStatus: 'failed',
          producedFiles: [],
          preTurnFileNames: ['deck.html'],
        }}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.queryByText('Slide updates have been applied.')).toBeNull();
    expect(screen.queryByText('The slide deck draft is ready.')).toBeNull();
  });

  it('shows deck completion copy for a sanitized terminal empty shell after reload', () => {
    render(
      <AssistantMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          runStatus: 'succeeded',
          startedAt: 1700000000,
          endedAt: 1700000005,
          events: [{ kind: 'status', label: 'requesting' }],
          producedFiles: [],
        }}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('The slide deck draft is ready.')).toBeTruthy();
  });

  it('keeps deck-creation copy when deck-patch appears only in a non-type attribute', () => {
    render(
      <AssistantMessage
        message={streamingMessage(
          '<artifact type="deck" identifier="deck-patch" title="slide-patch draft"><!doctype html><html><body><section class="slide"><h1>Draft',
        )}
        streaming
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Creating the slide deck now. Please wait a moment.')).toBeTruthy();
    expect(screen.queryByText('Applying slide updates. Please wait a moment.')).toBeNull();
  });

  it('shows live artifact progress even when raw code/thinking details are hidden', () => {
    render(
      <AssistantMessage
        message={streamingMessage(
          '<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>Draft',
        )}
        streaming
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Creating the slide deck now. Please wait a moment.')).toBeTruthy();
    expect(screen.getByText('Write')).toBeTruthy();
    expect(screen.getByText(/deck · \d+ lines/)).toBeTruthy();
    expect(screen.queryByText(/<!doctype html/)).toBeNull();
    expect(screen.queryByText('Waiting for first output')).toBeNull();
  });

  it('hides premature past-tense deck completion prose while the artifact is still streaming', () => {
    render(
      <AssistantMessage
        message={streamingMessage(
          '친근한 톤의 개발자 포트폴리오 2슬라이드 덱을 만들었어요!\n\n<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>Draft',
        )}
        streaming
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Creating the slide deck now. Please wait a moment.')).toBeTruthy();
    expect(screen.queryByText(/만들었어요/)).toBeNull();
    expect(screen.getByText('Write')).toBeTruthy();
  });

  it('keeps normal deck prose visible after the turn completes', () => {
    render(
      <AssistantMessage
        message={completedMessage(
          '슬라이드 구성을 설명드렸습니다. 표지 다음에 문제 정의를 두었어요.\n\n<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>Done</h1></section></body></html></artifact>',
        )}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText(/슬라이드 구성을 설명드렸습니다/)).toBeTruthy();
    expect(screen.queryByText('The slide deck draft is ready.')).toBeNull();
  });

  it('replaces leftover bare create-progress status with the completed draft lead', () => {
    render(
      <AssistantMessage
        message={completedMessage(
          '작성 중\n\n<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>Done</h1></section></body></html></artifact>',
        )}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.queryByText('작성 중')).toBeNull();
    expect(screen.getByText('The slide deck draft is ready.')).toBeTruthy();
  });

  it('strips bare status but keeps explanatory prose after the turn completes', () => {
    render(
      <AssistantMessage
        message={completedMessage(
          '작성 중\n\n표지 다음에 문제 정의를 두었어요.\n\n<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>Done</h1></section></body></html></artifact>',
        )}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.queryByText('작성 중')).toBeNull();
    expect(screen.getByText(/표지 다음에 문제 정의를 두었어요/)).toBeTruthy();
    expect(screen.queryByText('The slide deck draft is ready.')).toBeNull();
  });

  it('still shows bare create-progress status while the create turn streams', () => {
    render(
      <AssistantMessage
        message={streamingMessage(
          '작성 중\n\n<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>Draft',
        )}
        streaming
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('작성 중')).toBeTruthy();
    expect(screen.queryByText('The slide deck draft is ready.')).toBeNull();
  });

  it('replaces leftover edit status residue with the edit completed lead', () => {
    render(
      <AssistantMessage
        message={{
          ...completedMessage(
            '수정 반영 중\n\n<artifact type="deck-patch" identifier="deck"><section class="slide" data-slide-index="0"><h1>Hi</h1></section></artifact>',
          ),
          producedFiles: [],
          preTurnFileNames: ['deck.html'],
        }}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.queryByText('수정 반영 중')).toBeNull();
    expect(screen.getByText('Slide updates have been applied.')).toBeTruthy();
  });

  it('renders assistant prose from message.content when text events were not persisted', () => {
    render(
      <AssistantMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content:
            '슬라이드 구성을 설명드렸습니다. 표지 다음에 문제 정의를 두었어요.\n\n<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>Done</h1></section></body></html></artifact>',
          runStatus: 'succeeded',
          startedAt: 1700000000,
          endedAt: 1700000005,
          events: [],
          producedFiles: [
            {
              name: 'deck.html',
              path: 'deck.html',
              size: 1024,
              mtime: 1700000005,
              kind: 'html',
              mime: 'text/html',
            },
          ],
        }}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText(/슬라이드 구성을 설명드렸습니다/)).toBeTruthy();
    expect(screen.queryByText('The slide deck draft is ready.')).toBeNull();
  });

  it('prefers in-progress model prose over the fixed live-artifact fallback', () => {
    render(
      <AssistantMessage
        message={streamingMessage(
          '신입사원 온보딩 흐름에 맞춰 핵심 업무와 협업 문화를 담은 덱을 작성하고 있습니다.\n\n<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>Draft',
        )}
        streaming
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText(/신입사원 온보딩 흐름에 맞춰/)).toBeTruthy();
    expect(screen.queryByText('Creating the slide deck now. Please wait a moment.')).toBeNull();
    expect(screen.queryByText('슬라이드 초안을 작성 중입니다. 잠시만 기다려 주세요.')).toBeNull();
    expect(screen.getByText('Write')).toBeTruthy();
  });

  it('does not render an empty assistant row while a question form is still streaming', () => {
    render(
      <AssistantMessage
        message={streamingMessage(
          '<question-form id="discovery" title="Quick brief">{"questions":[{"id":"audience","label":"누가 발표를 보나요?"',
        )}
        streaming
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Waiting for first output')).toBeTruthy();
    expect(screen.queryByText(/<question-form/)).toBeNull();
  });

  it('falls back to a visible waiting state when the streamed text is hidden protocol only', () => {
    render(
      <AssistantMessage
        message={streamingMessage(
          '[Deliverable instruction] emit ONE complete Teamver deck in this same response inside `<artifact type="deck">`.',
        )}
        streaming
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Waiting for first output')).toBeTruthy();
    expect(screen.queryByText(/Deliverable instruction/)).toBeNull();
  });

  it('keeps a natural-language completion line after an artifact-only turn finishes', () => {
    render(
      <AssistantMessage
        message={completedMessage(
          '<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>Done</h1></section></body></html></artifact>',
        )}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('The slide deck draft is ready.')).toBeTruthy();
    expect(screen.queryByText(/<!doctype html/)).toBeNull();
  });

  it('uses slide-edit completion copy after a deck-patch artifact turn', () => {
    render(
      <AssistantMessage
        message={completedMessage(
          '<artifact type="deck-patch" identifier="deck"><section class="slide" data-slide-index="0"><h1>Hi</h1></section></artifact>',
        )}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Slide updates have been applied.')).toBeTruthy();
    expect(screen.queryByText('The slide deck draft is ready.')).toBeNull();
  });

  it('keeps slide-edit completion copy after reload when artifact tags were stripped', () => {
    // saveMessage sanitizer strips closed <artifact> blocks. After hard refresh
    // the row still has producedFiles / preTurnFileNames but no artifact markup —
    // the completion sentence must still render.
    render(
      <AssistantMessage
        message={{
          ...completedMessage(''),
          content: '',
          events: [{ kind: 'status', label: 'requesting' }],
          producedFiles: [
            {
              name: 'deck.html',
              path: 'deck.html',
              size: 2048,
              mtime: 1700000005,
              kind: 'html',
              mime: 'text/html',
            },
          ],
          preTurnFileNames: ['deck.html'],
        }}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Slide updates have been applied.')).toBeTruthy();
    expect(screen.queryByText('The slide deck draft is ready.')).toBeNull();
  });

  it('keeps completion lead when isLast is false (superseded failed sibling / later turn)', () => {
    render(
      <AssistantMessage
        message={{
          id: 'a-succeeded',
          role: 'assistant',
          content: '',
          runStatus: 'succeeded',
          startedAt: 1700000000,
          endedAt: 1700000005,
          events: [{ kind: 'status', label: 'requesting' }],
          producedFiles: [],
          preTurnFileNames: ['deck.html'],
        }}
        streaming={false}
        isLast={false}
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Slide updates have been applied.')).toBeTruthy();
  });

  it('keeps create completion copy after reload when artifact tags were stripped', () => {
    render(
      <AssistantMessage
        message={{
          ...completedMessage(''),
          content: '',
          events: [{ kind: 'status', label: 'requesting' }],
          producedFiles: [
            {
              name: 'deck.html',
              path: 'deck.html',
              size: 2048,
              mtime: 1700000005,
              kind: 'html',
              mime: 'text/html',
            },
          ],
          preTurnFileNames: [],
        }}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('The slide deck draft is ready.')).toBeTruthy();
  });

  it('still paints completion lead for historical succeeded shells when isLast is false', () => {
    // ChatPane omits same-turn superseded shells; historical turn anchors reach
    // AssistantMessage with isLast=false and must keep the completion sentence.
    render(
      <AssistantMessage
        message={{
          id: 'a-shell',
          role: 'assistant',
          content: '',
          runStatus: 'succeeded',
          endedAt: Date.now(),
          events: [{ kind: 'status', label: 'requesting' }],
        }}
        streaming={false}
        isLast={false}
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('The slide deck draft is ready.')).toBeTruthy();
  });

  it('hides embed tool-only rows that would show only the assistant header', () => {
    const { container } = render(
      <AssistantMessage
        message={{
          id: 'a-tools',
          role: 'assistant',
          content: '',
          runStatus: 'succeeded',
          endedAt: Date.now(),
          events: [
            {
              kind: 'tool_use',
              id: 'tu-1',
              name: 'Bash',
              input: { command: 'ls' },
            },
            {
              kind: 'tool_result',
              toolUseId: 'tu-1',
              content: 'ok',
            },
          ],
        } as ChatMessage}
        streaming={false}
        isLast={false}
        projectId="proj-1"
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('keeps embed Write tool rows that still surface FileOpsSummary', () => {
    const { container } = render(
      <AssistantMessage
        message={{
          id: 'a-write',
          role: 'assistant',
          content: '',
          runStatus: 'succeeded',
          endedAt: Date.now(),
          events: [
            {
              kind: 'tool_use',
              id: 'tu-1',
              name: 'Write',
              input: { path: 'deck.html' },
            },
            {
              kind: 'tool_result',
              toolUseId: 'tu-1',
              content: 'ok',
            },
          ],
        } as ChatMessage}
        streaming={false}
        isLast={false}
        projectId="proj-1"
      />,
    );

    expect(container.firstChild).not.toBeNull();
    expect(container.querySelector('.file-ops-row-path')?.textContent).toContain('deck.html');
  });

  it('keeps an embed tool-only row while it is the live streaming target', () => {
    render(
      <AssistantMessage
        message={{
          id: 'a-tools-live',
          role: 'assistant',
          content: '',
          runStatus: 'running',
          startedAt: Date.now(),
          events: [
            {
              kind: 'tool_use',
              id: 'tu-1',
              name: 'Bash',
              input: { command: 'ls' },
            },
          ],
        } as ChatMessage}
        streaming
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Waiting for first output')).toBeTruthy();
  });

  it('shows emergency HTML salvage warning detail in embed (not a bare error pill)', () => {
    const notice =
      '응답이 중간에 끊겨 생성된 HTML을 복구해 저장했습니다. 내용을 확인해 주세요.';
    const { container } = render(
      <AssistantMessage
        message={{
          id: 'a-emergency',
          role: 'assistant',
          content: '덱을 만들고 있어요.',
          runStatus: 'succeeded',
          startedAt: Date.now(),
          endedAt: Date.now(),
          events: [
            { kind: 'text', text: '덱을 만들고 있어요.' },
            {
              kind: 'status',
              label: 'warning',
              detail: notice,
              code: 'emergency_deck_fallback',
            },
          ],
          producedFiles: [
            {
              name: 'deck.html',
              path: 'deck.html',
              size: 1400,
              mtime: Date.now(),
              kind: 'html',
              mime: 'text/html',
            },
          ],
        } as ChatMessage}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );

    expect(container.querySelector('[data-status="warning"]')).not.toBeNull();
    expect(container.querySelector('.status-label')?.textContent).toBe('안내');
    expect(container.querySelector('.status-detail')?.textContent).toContain(
      '생성된 HTML을 복구해 저장했습니다',
    );
  });
});
