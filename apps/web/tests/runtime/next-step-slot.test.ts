// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { AUTO_CONTINUE_PROMPT_SENTINEL } from '../../src/runtime/resume';
import {
  hasBlockingFollowUpAfterAssistant,
  hasUserMessagesAfterAssistant,
  resolvePinnedNextStepSlot,
} from '../../src/runtime/next-step-slot';
import type { ChatMessage, ProjectFile } from '../../src/types';

function assistant(id = 'a1', overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: 'Done.',
    runStatus: 'succeeded',
    startedAt: 1,
    endedAt: 2,
    producedFiles: [{ name: 'deck.html', path: 'deck.html', kind: 'html', size: 1, mtime: 2 }],
    ...overrides,
  } as ChatMessage;
}

function user(id: string, content: string): ChatMessage {
  return { id, role: 'user', content } as ChatMessage;
}

describe('hasUserMessagesAfterAssistant', () => {
  it('returns true when a user message follows the assistant turn', () => {
    const messages = [user('u1', 'hi'), assistant('a1'), user('u2', 'follow up')];
    expect(hasUserMessagesAfterAssistant(messages, 'a1')).toBe(true);
  });

  it('returns false when the assistant turn is still the latest message', () => {
    const messages = [user('u1', 'hi'), assistant('a1')];
    expect(hasUserMessagesAfterAssistant(messages, 'a1')).toBe(false);
  });

  it('ignores auto-continue user prompts when deciding follow-up state', () => {
    const messages = [
      user('u1', 'hi'),
      assistant('a1'),
      user('u-auto', `${AUTO_CONTINUE_PROMPT_SENTINEL}\ncontinue`),
    ];
    expect(hasUserMessagesAfterAssistant(messages, 'a1')).toBe(false);
  });
});

describe('resolvePinnedNextStepSlot', () => {
  const projectFiles: ProjectFile[] = [
    { name: 'deck.html', path: 'deck.html', kind: 'html', size: 1, mtime: 2 },
  ];

  it('shows the pinned card when the last assistant turn succeeded with a deliverable', () => {
    const messages = [user('u1', 'make deck'), assistant('a1')];
    const state = resolvePinnedNextStepSlot({
      messages,
      lastAssistantId: 'a1',
      streaming: false,
      hasActiveRun: false,
      queuedSendCount: 0,
      projectId: 'proj-1',
      projectFiles,
      onToolboxAction: () => {},
    });
    expect(state.visible).toBe(true);
    expect(state.artifactName).toBe('deck.html');
  });

  it('hides once the user has already sent a follow-up message', () => {
    const messages = [user('u1', 'make deck'), assistant('a1'), user('u2', 'bigger')];
    const state = resolvePinnedNextStepSlot({
      messages,
      lastAssistantId: 'a1',
      streaming: false,
      hasActiveRun: false,
      queuedSendCount: 0,
      projectId: 'proj-1',
      projectFiles,
      onToolboxAction: () => {},
    });
    expect(state.visible).toBe(false);
  });

  it('keeps the card when the latest turn failed after a successful deliverable', () => {
    const messages = [
      user('u1', 'make deck'),
      assistant('a1'),
      user('u2', '이모지 넣어줘'),
      assistant('a2', {
        content: '',
        runStatus: 'failed',
        producedFiles: [],
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: '슬라이드 실행 중 오류가 발생했습니다.',
            code: 'incomplete_output',
          },
        ],
      }),
    ];
    const state = resolvePinnedNextStepSlot({
      messages,
      lastAssistantId: 'a2',
      streaming: false,
      hasActiveRun: false,
      queuedSendCount: 0,
      projectId: 'proj-1',
      projectFiles,
      onToolboxAction: () => {},
    });
    expect(state.visible).toBe(true);
    expect(state.artifactName).toBe('deck.html');
    expect(state.assistantMessageId).toBe('a1');
    expect(hasBlockingFollowUpAfterAssistant(messages, 'a1')).toBe(false);
  });

  it('hides again after a later successful follow-up turn', () => {
    const messages = [
      user('u1', 'make deck'),
      assistant('a1'),
      user('u2', 'bigger'),
      assistant('a2', {
        producedFiles: [{ name: 'deck.html', path: 'deck.html', kind: 'html', size: 2, mtime: 3 }],
      }),
      user('u3', 'again'),
    ];
    const state = resolvePinnedNextStepSlot({
      messages,
      lastAssistantId: 'a2',
      streaming: false,
      hasActiveRun: false,
      queuedSendCount: 0,
      projectId: 'proj-1',
      projectFiles,
      onToolboxAction: () => {},
    });
    expect(state.visible).toBe(false);
    expect(state.assistantMessageId).toBe('a2');
  });

  it('hides while a run is active or queued sends are waiting', () => {
    const messages = [user('u1', 'make deck'), assistant('a1')];
    expect(resolvePinnedNextStepSlot({
      messages,
      lastAssistantId: 'a1',
      streaming: true,
      hasActiveRun: false,
      queuedSendCount: 0,
      projectId: 'proj-1',
      projectFiles,
      onToolboxAction: () => {},
    }).visible).toBe(false);
    expect(resolvePinnedNextStepSlot({
      messages,
      lastAssistantId: 'a1',
      streaming: false,
      hasActiveRun: true,
      queuedSendCount: 0,
      projectId: 'proj-1',
      projectFiles,
      onToolboxAction: () => {},
    }).visible).toBe(false);
    expect(resolvePinnedNextStepSlot({
      messages,
      lastAssistantId: 'a1',
      streaming: false,
      hasActiveRun: false,
      queuedSendCount: 1,
      projectId: 'proj-1',
      projectFiles,
      onToolboxAction: () => {},
    }).visible).toBe(false);
  });
});
