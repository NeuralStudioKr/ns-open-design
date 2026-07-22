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

    expect(screen.getByText('Write')).toBeTruthy();
    expect(screen.getByText(/deck/)).toBeTruthy();
    expect(screen.queryByText(/<!doctype html/)).toBeNull();
    expect(screen.queryByText('Waiting for first output')).toBeNull();
  });
});
