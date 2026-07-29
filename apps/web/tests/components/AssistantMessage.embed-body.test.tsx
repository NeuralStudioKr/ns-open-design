// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

vi.mock('../../src/teamver/branding/TeamverBrandingProvider', () => ({
  useTeamverBranding: () => ({
    enabled: false,
    hideAssistantModelLabels: false,
    hideAssistantThinkingDetails: true,
    slideOnlyMvp: false,
    title: 'Open Design',
  }),
}));

afterEach(() => {
  cleanup();
});

describe('AssistantMessage embed body visibility', () => {
  it('shows generic completion copy for a terminal succeeded empty shell', () => {
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
        isLast
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('The task is complete.')).toBeTruthy();
    expect(screen.queryByText('The slide deck draft is ready.')).toBeNull();
  });

  it('shows an error pill for failed embed rows without a top-level error card', () => {
    render(
      <AssistantMessage
        message={{
          id: 'a-failed',
          role: 'assistant',
          content: '',
          runStatus: 'failed',
          endedAt: Date.now(),
          events: [{ kind: 'status', label: 'error', detail: 'still broken' }],
        }}
        streaming={false}
        isLast
        projectId="proj-1"
        errorCardOwnerId="other-message"
      />,
    );

    expect(screen.getByText('still broken')).toBeTruthy();
  });

  it('keeps inline error detail in embed even when this row owns the top-level error card', () => {
    render(
      <AssistantMessage
        message={{
          id: 'a-failed',
          role: 'assistant',
          content: '',
          runStatus: 'failed',
          endedAt: Date.now(),
          events: [{ kind: 'status', label: 'error', detail: 'upstream timeout' }],
        }}
        streaming={false}
        isLast
        projectId="proj-1"
        errorCardOwnerId="a-failed"
      />,
    );

    expect(screen.getByText('upstream timeout')).toBeTruthy();
  });
});
