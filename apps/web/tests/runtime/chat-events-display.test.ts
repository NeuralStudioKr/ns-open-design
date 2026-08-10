import { describe, expect, it } from 'vitest';

import { EMERGENCY_DECK_FALLBACK_STATUS_CODE } from '../../src/artifacts/emergency-deck';
import {
  appendErrorStatusEvent,
  assistantEventsForDisplay,
  assistantMessageTextBody,
  attachAutoContinueIncompleteOutputNotice,
  attachPersistedChatError,
  clearDurableDeliverableErrorsAfterRecovery,
  messageHasPersistedChatError,
  messageHasVisibleProse,
  reconcileChatMessageOnLoad,
} from '../../src/runtime/chat-events';
import { encodePersistedRunErrorDetail } from '../../src/teamver/projectErrorMessages';
import { AUTO_CONTINUE_STATUS_CODE } from '../../src/runtime/resume';
import type { ChatMessage } from '../../src/types';

const DELIVERABLE_MISSING_ENCODED = encodePersistedRunErrorDetail(
  '슬라이드 결과물이 생성되지 않았습니다. 응답이 중간에 끊겼거나 HTML 파일이 저장되지 않았습니다. 이어서 다시 시도하세요.',
  { kind: 'skipped-incomplete' },
);

describe('appendErrorStatusEvent', () => {
  it('replaces prior durable error events so a turn keeps one user-facing copy', () => {
    const first = appendErrorStatusEvent(
      {
        id: 'a1',
        role: 'assistant',
        content: 'partial',
        createdAt: 1,
        events: [{ kind: 'text', text: 'partial' }],
      },
      '슬라이드 실행 중 오류가 발생했습니다. 다시 시도하세요.',
      'UPSTREAM_UNAVAILABLE',
    );
    const second = appendErrorStatusEvent(
      first,
      DELIVERABLE_MISSING_ENCODED,
      'incomplete_output',
    );
    expect(second.events).toEqual([
      { kind: 'text', text: 'partial' },
      {
        kind: 'status',
        label: 'error',
        detail: DELIVERABLE_MISSING_ENCODED,
        code: 'incomplete_output',
      },
    ]);
  });
});

describe('assistantEventsForDisplay', () => {
  it('returns events unchanged when a non-empty text event exists and matches content length', () => {
    const events: ChatMessage['events'] = [
      { kind: 'text', text: 'Hello' },
      { kind: 'status', label: 'working', detail: 'Deck' },
    ];
    expect(
      assistantEventsForDisplay({ content: 'Hello', events }),
    ).toBe(events);
  });

  it('synthesizes a text event from message.content when text events are missing', () => {
    const resolved = assistantEventsForDisplay({
      content: '슬라이드 설명입니다.\n\n<artifact type="deck"></artifact>',
      events: [{ kind: 'status', label: 'working', detail: 'Deck' }],
    });
    expect(resolved[0]).toEqual({
      kind: 'text',
      text: '슬라이드 설명입니다.\n\n<artifact type="deck"></artifact>',
    });
    expect(resolved).toHaveLength(2);
  });

  it('uses content when only status events exist but content already has prose', () => {
    const resolved = assistantEventsForDisplay({
      content: 'Streaming prose before artifact tag',
      events: [{ kind: 'status', label: 'working', detail: 'Deck' }],
    });
    expect(resolved[0]).toEqual({ kind: 'text', text: 'Streaming prose before artifact tag' });
  });

  it('falls back to content when text events are blank after sanitizable whitespace', () => {
    const resolved = assistantEventsForDisplay({
      content: 'Visible prose',
      events: [{ kind: 'text', text: '   ' }],
    });
    expect(resolved[0]).toEqual({ kind: 'text', text: 'Visible prose' });
  });

  it('upgrades truncated text events to full message.content when no tool/thinking structure exists', () => {
    const resolved = assistantEventsForDisplay({
      content: 'Full assistant prose with deck context and closing notes.',
      events: [{ kind: 'text', text: 'Full assistant' }],
    });
    expect(resolved[0]).toEqual({
      kind: 'text',
      text: 'Full assistant prose with deck context and closing notes.',
    });
    expect(resolved).toHaveLength(1);
  });

  it('keeps interleaved tool events when content is longer than joined text', () => {
    const events: ChatMessage['events'] = [
      { kind: 'text', text: 'Planning…' },
      { kind: 'tool_use', id: 't1', name: 'Write', input: {} },
      { kind: 'text', text: 'Done.' },
    ];
    expect(
      assistantEventsForDisplay({
        content: 'Planning… extra tail after tool use that is not in events yet',
        events,
      }),
    ).toBe(events);
  });

  it('assistantMessageTextBody prefers the longer of content and display events', () => {
    expect(
      assistantMessageTextBody({
        content: 'Longer persisted content wins.',
        events: [{ kind: 'text', text: 'Short' }],
      }),
    ).toBe('Longer persisted content wins.');
    expect(
      assistantMessageTextBody({
        content: '',
        events: [{ kind: 'text', text: 'Events only' }],
      }),
    ).toBe('Events only');
  });
});

describe('messageHasVisibleProse', () => {
  it('ignores thinking-only events so merge gates do not prefer stubs', () => {
    expect(
      messageHasVisibleProse({
        content: '',
        events: [{ kind: 'thinking', text: 'planning…' }],
      }),
    ).toBe(false);
    expect(
      messageHasVisibleProse({
        content: '',
        events: [{ kind: 'text', text: 'hello' }],
      }),
    ).toBe(true);
  });
});

describe('appendErrorStatusEvent', () => {
  it('replaces prior durable error events so a turn keeps one user-facing copy', () => {
    const first = appendErrorStatusEvent(
      {
        id: 'a1',
        role: 'assistant',
        content: 'partial',
        createdAt: 1,
        events: [{ kind: 'text', text: 'partial' }],
      },
      '슬라이드 실행 중 오류가 발생했습니다. 다시 시도하세요.',
      'UPSTREAM_UNAVAILABLE',
    );
    const second = appendErrorStatusEvent(
      first,
      DELIVERABLE_MISSING_ENCODED,
      'incomplete_output',
    );
    expect(second.events).toEqual([
      { kind: 'text', text: 'partial' },
      {
        kind: 'status',
        label: 'error',
        detail: DELIVERABLE_MISSING_ENCODED,
        code: 'incomplete_output',
      },
    ]);
  });
});

describe('attachPersistedChatError', () => {
  it('appends a status:error event and marks the run failed', () => {
    const updated = attachPersistedChatError(
      {
        id: 'a1',
        role: 'assistant',
        content: 'partial',
        createdAt: 1,
        runStatus: 'succeeded',
        endedAt: 2,
        events: [{ kind: 'text', text: 'partial' }],
      },
      '저장을 거부했습니다: incomplete HTML',
      'artifact_rejected',
    );
    expect(updated.runStatus).toBe('failed');
    expect(updated.endedAt).toEqual(expect.any(Number));
    expect(updated.events?.at(-1)).toEqual({
      kind: 'status',
      label: 'error',
      detail: '저장을 거부했습니다: incomplete HTML',
      code: 'artifact_rejected',
    });
    expect(messageHasPersistedChatError(updated)).toBe(true);
  });

  it('does not flip runStatus for auto-continue notices', () => {
    const message: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'still going',
      createdAt: 1,
      runStatus: 'running',
    };
    const updated = attachPersistedChatError(
      message,
      'Continuing…',
      AUTO_CONTINUE_STATUS_CODE,
    );
    expect(updated.runStatus).toBe('running');
    expect(messageHasPersistedChatError(updated)).toBe(false);
  });
});

describe('attachAutoContinueIncompleteOutputNotice', () => {
  it('stacks auto-continue notice on a durable incomplete_output error', () => {
    const updated = attachAutoContinueIncompleteOutputNotice(
      {
        id: 'a1',
        role: 'assistant',
        content: 'partial',
        createdAt: 1,
        runStatus: 'running',
        events: [{ kind: 'text', text: 'partial' }],
      },
      '결과물이 완성되지 않아 자동으로 이어쓰기를 시도합니다…',
      '슬라이드 결과물이 생성되지 않았습니다.',
      'incomplete_output',
    );
    expect(updated.runStatus).toBe('failed');
    expect(updated.resumable).toBe(true);
    expect(updated.events).toEqual([
      { kind: 'text', text: 'partial' },
      {
        kind: 'status',
        label: 'error',
        detail: '슬라이드 결과물이 생성되지 않았습니다.',
        code: 'incomplete_output',
      },
      {
        kind: 'status',
        label: 'error',
        detail: '결과물이 완성되지 않아 자동으로 이어쓰기를 시도합니다…',
        code: AUTO_CONTINUE_STATUS_CODE,
      },
    ]);
    expect(messageHasPersistedChatError(updated)).toBe(true);
  });
});

describe('reconcileChatMessageOnLoad', () => {
  it('marks failed runStatus when persisted error status events survived without runStatus', () => {
    const reconciled = reconcileChatMessageOnLoad({
      id: 'a1',
      role: 'assistant',
      content: 'partial',
      createdAt: 1,
      runStatus: 'running',
      events: [
        { kind: 'status', label: 'error', detail: 'Provider timeout', code: 'timeout' },
      ],
    });
    expect(reconciled.runStatus).toBe('failed');
    expect(reconciled.endedAt).toEqual(expect.any(Number));
  });

  it('ignores auto-continue status events when reconciling runStatus', () => {
    const message: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'still going',
      createdAt: 1,
      runStatus: 'running',
      events: [
        {
          kind: 'status',
          label: 'error',
          detail: 'Continuing…',
          code: 'auto_continue_incomplete_output',
        },
      ],
    };
    expect(reconcileChatMessageOnLoad(message)).toBe(message);
  });

  it('keeps emergency salvage success as succeeded and strips leftover incomplete_output', () => {
    const withErrors: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'partial',
      createdAt: 1,
      runStatus: 'succeeded',
      events: [
        {
          kind: 'status',
          label: 'error',
          detail: DELIVERABLE_MISSING_ENCODED,
          code: 'incomplete_output',
        },
        {
          kind: 'status',
          label: 'error',
          detail: '이어쓰기…',
          code: AUTO_CONTINUE_STATUS_CODE,
        },
        {
          kind: 'status',
          label: 'warning',
          detail: '임시 복구 덱',
          code: EMERGENCY_DECK_FALLBACK_STATUS_CODE,
        },
      ],
    };
    const cleared = clearDurableDeliverableErrorsAfterRecovery(withErrors);
    expect(cleared.events?.some((event) => event.code === 'incomplete_output')).toBe(false);
    expect(cleared.events?.some((event) => event.code === AUTO_CONTINUE_STATUS_CODE)).toBe(false);
    expect(cleared.events?.some((event) => event.code === EMERGENCY_DECK_FALLBACK_STATUS_CODE)).toBe(
      true,
    );

    const reconciled = reconcileChatMessageOnLoad(withErrors);
    expect(reconciled.runStatus).toBe('succeeded');
    expect(reconciled.events?.some((event) => event.code === 'incomplete_output')).toBe(false);
  });

  it('rehydrates user comment chips from attached-preview-comments content on load', () => {
    const content = [
      '더 크게 조정',
      '',
      '<attached-preview-comments>',
      'Hard scope: change ONLY the elements identified below by selector / position / pod members.',
      '',
      '1. hero-title',
      'targetKind: element',
      'file: deck.html',
      'label: h2',
      'selector: [data-od-id="hero-title"]',
      'position: x0 y0 100x24',
      'currentText: Title',
      'htmlHint: <h2>',
      '</attached-preview-comments>',
    ].join('\n');
    const reconciled = reconcileChatMessageOnLoad({
      id: 'u1',
      role: 'user',
      content,
      createdAt: 1,
    });
    expect(reconciled.commentAttachments?.[0]?.elementId).toBe('hero-title');
  });
});
