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
    title: 'Teamver Design',
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

  it('prefers model-authored natural prose over the fixed live-artifact fallback', () => {
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
});
