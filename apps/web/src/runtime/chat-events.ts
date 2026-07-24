import type { AgentEvent, ChatMessage } from '../types';

function joinedTextFromEvents(events: AgentEvent[]): string {
  let out = '';
  for (const event of events) {
    if (event.kind === 'text' && typeof event.text === 'string') {
      out += event.text;
    }
  }
  return out;
}

function hasNonProseStructureEvents(events: AgentEvent[]): boolean {
  return events.some(
    (event) =>
      event.kind === 'tool_use'
      || event.kind === 'tool_result'
      || event.kind === 'thinking',
  );
}

/**
 * Prefer structured `events` for the chat UI. When persisted rows only have
 * `content` (or text events were stripped / truncated), synthesize or upgrade
 * text so assistant prose still renders after reload/recovery.
 */
export function assistantEventsForDisplay(message: Pick<ChatMessage, 'content' | 'events'>): AgentEvent[] {
  const events = message.events ?? [];
  const contentRaw = message.content ?? '';
  const content = contentRaw.trim();
  const fromEvents = joinedTextFromEvents(events).trim();
  const hasVisibleTextEvent = fromEvents.length > 0;

  if (!content && !hasVisibleTextEvent) return events;

  if (!hasVisibleTextEvent && content) {
    return [{ kind: 'text', text: contentRaw }, ...events];
  }

  if (
    content.length > fromEvents.length
    && !hasNonProseStructureEvents(events)
  ) {
    const tail = events.filter((event) => event.kind !== 'text');
    return [{ kind: 'text', text: contentRaw }, ...tail];
  }

  return events;
}

/** Longest assistant prose body for gates that must match what the chat UI shows. */
export function assistantMessageTextBody(message: Pick<ChatMessage, 'content' | 'events'>): string {
  const contentRaw = message.content ?? '';
  const events = assistantEventsForDisplay(message);
  const fromEvents = joinedTextFromEvents(events);
  if (!contentRaw.trim()) return fromEvents;
  if (!fromEvents.trim()) return contentRaw;
  return fromEvents.trim().length >= contentRaw.trim().length ? fromEvents : contentRaw;
}

export function appendErrorStatusEvent(
  message: ChatMessage,
  detail: string,
  code?: string,
): ChatMessage {
  if (!detail) return message;
  const events = message.events ?? [];
  const last = events[events.length - 1];
  if (last?.kind === 'status' && last.label === 'error' && last.detail === detail) {
    return message;
  }
  if (!detail?.trim()) {
    return message;
  }
  return {
    ...message,
    events: [...events, { kind: 'status', label: 'error', detail, ...(code ? { code } : {}) }],
  };
}
