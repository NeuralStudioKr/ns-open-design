import type { AgentEvent, ChatMessage } from '../types';
import { EMERGENCY_DECK_FALLBACK_STATUS_CODE } from '../artifacts/emergency-deck';
import { reconcileUserCommentAttachments } from '../comments';
import { AUTO_CONTINUE_STATUS_CODE } from './resume';

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

export function messageHasVisibleProse(
  message: Pick<ChatMessage, 'content' | 'events'>,
): boolean {
  if ((message.content ?? '').trim().length > 0) return true;
  // Thinking/reasoning is not chat prose — Teamver empty-shell / merge gates
  // must not treat a thinking-only stub as a richer local body.
  return (message.events ?? []).some(
    (event) =>
      event.kind === 'text'
      && typeof event.text === 'string'
      && event.text.trim().length > 0,
  );
}

function hasPersistedRunErrorEvent(events: AgentEvent[]): boolean {
  return events.some(
    (event) =>
      event.kind === 'status'
      && event.label === 'error'
      && event.code !== AUTO_CONTINUE_STATUS_CODE
      // Emergency draft salvage marks the run succeeded — do not flip it back
      // to failed on reload just because the notice reused the status channel.
      && event.code !== EMERGENCY_DECK_FALLBACK_STATUS_CODE
      && Boolean(event.detail?.trim()),
  );
}

/**
 * Light-touch normalization after loading messages from the daemon.
 * Display-time sanitization stays in AssistantMessage; this only repairs
 * metadata gaps that would hide error cards after reload.
 */
export function reconcileChatMessageOnLoad(message: ChatMessage): ChatMessage {
  let reconciled = reconcileUserCommentAttachments(message);
  const events = reconciled.events ?? [];
  if (!hasPersistedRunErrorEvent(events)) return reconciled;
  if (reconciled.runStatus === 'failed' || reconciled.runStatus === 'canceled') return reconciled;
  return {
    ...reconciled,
    runStatus: 'failed',
    endedAt: reconciled.endedAt ?? Date.now(),
  };
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

/** Non-fatal assistant-card notice (e.g. emergency draft deck fallback). */
export function appendWarningStatusEvent(
  message: ChatMessage,
  detail: string,
  code?: string,
): ChatMessage {
  if (!detail?.trim()) return message;
  const events = message.events ?? [];
  const last = events[events.length - 1];
  if (last?.kind === 'status' && last.label === 'warning' && last.detail === detail) {
    return message;
  }
  return {
    ...message,
    events: [...events, { kind: 'status', label: 'warning', detail, ...(code ? { code } : {}) }],
  };
}
