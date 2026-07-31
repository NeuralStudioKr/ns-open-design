// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import { buildChatRenderItems } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';
import { reconcileChatMessageOnLoad } from '../../src/runtime/chat-events';
import {
  hasEmbedVisibleAssistantBody,
  isTerminalSucceededEmptyShellAnchor,
  isTerminalSucceededEmptyShellForDisplay,
  terminalSucceededAnchorLeadCopy,
} from '../../src/runtime/chat-message-render';
import { dedupeConversationAssistantRows } from '../../src/runtime/conversation-message-dedupe';
import { mergeActiveRunsIntoMessages } from '../../src/teamver/backgroundChatRecovery';
import { AUTO_CONTINUE_PROMPT_SENTINEL } from '../../src/runtime/resume';

vi.mock('../../src/teamver/branding/TeamverBrandingProvider', () => ({
  useTeamverBranding: () => ({
    enabled: false,
    hideAssistantModelLabels: false,
    hideAssistantThinkingDetails: true,
    slideOnlyMvp: false,
    title: 'Open Design',
  }),
}));

const embedCtx = {
  streaming: false,
  lastAssistantId: undefined as string | undefined,
  hideAssistantThinkingDetails: true,
};

afterEach(() => {
  cleanup();
});

function reloadPipeline(messages: ChatMessage[]) {
  const loaded = mergeActiveRunsIntoMessages(
    dedupeConversationAssistantRows(messages.map(reconcileChatMessageOnLoad)),
    [],
  );
  const lastAssistantId = loaded.filter((message) => message.role === 'assistant').at(-1)?.id;
  const items = buildChatRenderItems(loaded, {
    ...embedCtx,
    lastAssistantId,
  });
  return { loaded, items, lastAssistantId };
}

describe('chat assistant body pipeline', () => {
  it('exports terminal succeeded shell helpers aligned with AssistantMessage', () => {
    const shell: ChatMessage = {
      id: 'a-shell',
      role: 'assistant',
      content: '',
      runStatus: 'succeeded',
      endedAt: 2,
      events: [{ kind: 'status', label: 'requesting' }],
    };
    expect(isTerminalSucceededEmptyShellForDisplay(shell)).toBe(true);
    expect(
      isTerminalSucceededEmptyShellAnchor(shell, { isLast: true, streaming: false }),
    ).toBe(true);
    expect(hasEmbedVisibleAssistantBody(shell)).toBe(true);
    expect(terminalSucceededAnchorLeadCopy('en')).toBe('The task is complete.');
    expect(terminalSucceededAnchorLeadCopy('ko-KR')).toBe('작업이 완료되었습니다.');
  });

  it('renders reloaded assistant prose through the full embed pipeline', () => {
    const { items, lastAssistantId } = reloadPipeline([
      { id: 'u1', role: 'user', content: 'explain this', createdAt: 1 },
      {
        id: 'a1',
        role: 'assistant',
        content: 'Here is the explanation.',
        runStatus: 'succeeded',
        endedAt: 2,
        createdAt: 2,
      },
    ]);

    expect(items.map((item) => item.message.id)).toEqual(['u1', 'a1']);
    render(
      <AssistantMessage
        message={items[1]!.message}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );
    expect(screen.getByText('Here is the explanation.')).toBeTruthy();
    expect(lastAssistantId).toBe('a1');
  });

  it('renders completion copy for auto-continue terminal succeeded shells', () => {
    const { items } = reloadPipeline([
      { id: 'u1', role: 'user', content: 'make deck', createdAt: 1 },
      {
        id: 'a-failed',
        role: 'assistant',
        content: '',
        runStatus: 'failed',
        resumable: true,
        endedAt: 2,
        createdAt: 2,
        events: [{ kind: 'status', label: 'error', detail: 'incomplete', code: 'incomplete_output' }],
      },
      {
        id: 'u-auto',
        role: 'user',
        content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\ncontinue`,
        createdAt: 3,
      },
      {
        id: 'a-succeeded',
        role: 'assistant',
        content: '',
        runStatus: 'succeeded',
        endedAt: 4,
        createdAt: 4,
        events: [{ kind: 'status', label: 'requesting' }],
      },
    ]);

    expect(items.map((item) => item.message.id)).toEqual(['u1', 'a-succeeded']);
    render(
      <AssistantMessage
        message={items[1]!.message}
        streaming={false}
        isLast
        projectId="proj-1"
      />,
    );
    expect(screen.getByText('The task is complete.')).toBeTruthy();
    expect(screen.queryByText('incomplete')).toBeNull();
  });

  it('keeps failed embed rows on reload; ChatPane owns the error card copy', () => {
    const { items } = reloadPipeline([
      { id: 'u1', role: 'user', content: 'run task', createdAt: 1 },
      {
        id: 'a-failed',
        role: 'assistant',
        content: '',
        runStatus: 'failed',
        endedAt: 2,
        createdAt: 2,
        events: [{ kind: 'status', label: 'error', detail: 'upstream timeout' }],
      },
    ]);

    expect(items.map((item) => item.message.id)).toEqual(['u1', 'a-failed']);
    // When ChatPane sets errorCardOwnerId, the inline StatusPill is suppressed
    // so the diagnostic card is the single copy SSOT — the assistant row itself
    // must still mount.
    const { container } = render(
      <AssistantMessage
        message={items[1]!.message}
        streaming={false}
        isLast
        projectId="proj-1"
        errorCardOwnerId="a-failed"
      />,
    );
    expect(screen.queryByText('upstream timeout')).toBeNull();
    expect(container.querySelector('[data-message-id="a-failed"]')).toBeTruthy();
  });

  it('does not reserve phantom rows for artifact-only shells without deliverables', () => {
    const message: ChatMessage = {
      id: 'a-artifact',
      role: 'assistant',
      content: '<artifact type="deck" identifier="deck"></artifact>',
      runStatus: 'succeeded',
      endedAt: 2,
    };
    expect(hasEmbedVisibleAssistantBody(message)).toBe(false);
    expect(
      buildChatRenderItems([{ id: 'u1', role: 'user', content: 'hi' }, message], {
        ...embedCtx,
        lastAssistantId: 'a-artifact',
      }).map((item) => item.message.id),
    ).toEqual(['u1']);
  });
});
