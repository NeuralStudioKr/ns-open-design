import { describe, expect, it } from 'vitest';

import { assistantEventsForDisplay, assistantMessageTextBody } from '../../src/runtime/chat-events';
import type { ChatMessage } from '../../src/types';

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
