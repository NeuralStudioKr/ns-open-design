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
    title: 'Teamver',
  }),
}));

afterEach(() => {
  cleanup();
});

function succeededMessage(): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Done.',
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000005,
    events: [{ kind: 'text', text: 'Done.' } as ChatMessage['events'][number]],
    producedFiles: [],
  } as ChatMessage;
}

describe('AssistantMessage embed reaction hide', () => {
  it('hides fork and helpful/not-helpful controls in Teamver embed', () => {
    render(
      <AssistantMessage
        message={succeededMessage()}
        streaming={false}
        projectId="proj-1"
        onForkFromMessage={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('assistant-fork-button')).toBeNull();
    expect(screen.queryByTestId('assistant-feedback-positive')).toBeNull();
    expect(screen.queryByTestId('assistant-feedback-negative')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fork from here' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Helpful' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Not helpful' })).toBeNull();
  });
});
