import { looksLikeTagStrippedSlideBodyDump } from '@open-design/contracts';
import type { AgentEvent, ChatMessage } from '../types';
import { reconcileUserCommentAttachments } from '../comments';
import { recoverChatAttachmentsFromMentions } from '../utils/recoverChatAttachmentsFromMentions';
import {
  AUTO_CONTINUE_STATUS_CODE,
  EMERGENCY_DECK_FALLBACK_STATUS_CODE,
  OUTLINE_DECK_FALLBACK_STATUS_CODE,
} from './deliverable-lifecycle-codes';

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

  // Reload: persist may keep tag-stripped slide copy in events while content
  // is already the short completion status. Prefer the clean content.
  if (
    content
    && fromEvents.length > content.length
    && !looksLikeReloadedSlideBodyDump(content)
    && (
      looksLikeReloadedSlideBodyDump(fromEvents)
      || (
        looksLikeShortHangulCompletionStatus(content)
        && !looksLikeShortHangulCompletionStatus(fromEvents)
        && looksLikeLeftoverDeckChrome(fromEvents)
      )
    )
  ) {
    const tail = events.filter((event) => event.kind !== 'text');
    return [{ kind: 'text', text: contentRaw }, ...tail];
  }

  return events;
}

function looksLikeShortHangulCompletionStatus(text: string): boolean {
  const trimmed = String(text ?? '').trim();
  if (!trimmed || trimmed.length > 160) return false;
  if (looksLikeTagStrippedSlideBodyDump(trimmed)) return false;
  if (/<(?:artifact|html|body|question-form|ask-question)\b/i.test(trimmed)) return false;
  return /[\uac00-\ud7af]/.test(trimmed);
}

function looksLikeLeftoverDeckChrome(text: string): boolean {
  return /(?:HOOK|SCREEN|GOAL|TASK|CASE|WORKSHOP|DECK|MOTIF|TRACK|LECTURE|SLIDE|PAGE)\s*(?:\d{1,2}|[A-Z])?\s*[·•\-–—]/i.test(
    String(text ?? ''),
  );
}

function looksLikeReloadedSlideBodyDump(text: string): boolean {
  const trimmed = String(text ?? '').trim();
  if (looksLikeTagStrippedSlideBodyDump(trimmed)) return true;
  if (trimmed.length < 40) return false;
  if (looksLikeShortHangulCompletionStatus(trimmed)) return false;
  if (
    /[\uac00-\ud7af][A-Za-z]|[A-Za-z][\uac00-\ud7af]/.test(trimmed)
    && /(?:TRACK|HTML|CSS|SEO|\bsvg\b|\bvideo\b|critical|HOOK|SCREEN|GOAL|TASK|CASE|WORKSHOP|DECK|MOTIF)/i.test(trimmed)
  ) {
    return true;
  }
  return /(?:<\/(?:artifact|html|body)\s*>|(?:html|body|head|section)\s*>|<!doctype\s+html)/i.test(
    trimmed,
  );
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
      // Emergency / outline salvage marks the run succeeded — do not flip it
      // back to failed on reload just because the notice reused the status channel.
      && event.code !== EMERGENCY_DECK_FALLBACK_STATUS_CODE
      && event.code !== OUTLINE_DECK_FALLBACK_STATUS_CODE
      && Boolean(event.detail?.trim()),
  );
}

/**
 * Light-touch normalization after loading messages from the daemon.
 * Display-time sanitization stays in AssistantMessage; this only repairs
 * metadata gaps that would hide error cards after reload.
 */
/**
 * After emergency salvage marks a run succeeded, drop durable incomplete /
 * auto-continue error events so reload cannot flip `succeeded` → `failed`
 * via `reconcileChatMessageOnLoad`.
 */
function isDeliverableLifecycleErrorEvent(event: AgentEvent): boolean {
  if (event.kind !== 'status' || event.label !== 'error') return false;
  const code = event.code;
  return (
    code === 'incomplete_output'
    || code === AUTO_CONTINUE_STATUS_CODE
    || code === OUTLINE_DECK_FALLBACK_STATUS_CODE
  );
}

/**
 * Strip deliverable lifecycle `status:error` rows from a succeeded assistant
 * message. Keeps salvage `warning` notices (emergency / outline) for banner
 * rebuild while removing stale incomplete / auto-continue errors that block
 * empty-shell completion leads after reload.
 */
export function clearDurableDeliverableErrorsAfterRecovery(
  message: ChatMessage,
): ChatMessage {
  const events = message.events ?? [];
  const nextEvents = events.filter((event) => !isDeliverableLifecycleErrorEvent(event));
  if (nextEvents.length === events.length) return message;
  return { ...message, events: nextEvents };
}

export function reconcileChatMessageOnLoad(message: ChatMessage): ChatMessage {
  let reconciled = recoverChatAttachmentsFromMentions(
    reconcileUserCommentAttachments(message),
  );
  if (reconciled.runStatus === 'succeeded') {
    reconciled = clearDurableDeliverableErrorsAfterRecovery(reconciled);
  }
  const events = reconciled.events ?? [];
  if (!hasPersistedRunErrorEvent(events)) return reconciled;
  if (reconciled.runStatus === 'failed' || reconciled.runStatus === 'canceled') return reconciled;
  return {
    ...reconciled,
    runStatus: 'failed',
    endedAt: reconciled.endedAt ?? Date.now(),
  };
}

function isTransientChatErrorCode(code: string | undefined): boolean {
  return (
    code === AUTO_CONTINUE_STATUS_CODE
    || code === EMERGENCY_DECK_FALLBACK_STATUS_CODE
    || code === OUTLINE_DECK_FALLBACK_STATUS_CODE
  );
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
  // Durable errors replace prior status:error events so StatusPill / past cards
  // / the tail card cannot show conflicting copy for the same turn. Transient
  // auto-continue notices stack on top of the durable error underneath.
  const baseEvents = isTransientChatErrorCode(code)
    ? events
    : events.filter((event) => !(event.kind === 'status' && event.label === 'error'));
  return {
    ...message,
    events: [...baseEvents, { kind: 'status', label: 'error', detail, ...(code ? { code } : {}) }],
  };
}

/**
 * Persist a user-visible chat error onto an assistant message so ChatPane can
 * rebuild the error card after reload (`error` React state is ephemeral and
 * cleared on message load). Marks the run failed unless the code is a
 * transient auto-continue / emergency-draft notice.
 */
export function attachPersistedChatError(
  message: ChatMessage,
  detail: string,
  code?: string,
): ChatMessage {
  if (!detail?.trim()) return message;
  const withEvent = appendErrorStatusEvent(message, detail, code);
  if (isTransientChatErrorCode(code)) {
    return withEvent;
  }
  if (withEvent.runStatus === 'failed' || withEvent.runStatus === 'canceled') {
    return withEvent.endedAt ? withEvent : { ...withEvent, endedAt: Date.now() };
  }
  return {
    ...withEvent,
    runStatus: 'failed',
    endedAt: withEvent.endedAt ?? Date.now(),
  };
}

/**
 * Arm the capped automatic-continue notice while keeping a durable
 * `incomplete_output` (or caller-supplied) error underneath.
 *
 * Auto-continue notices alone are non-fatal in daemon merge and were wiped by
 * later streaming PUTs — hard reload then left only the agent header. Always
 * persist the real deliverable failure first, then stack the notice on top for
 * the live 600ms race window.
 */
export function attachAutoContinueIncompleteOutputNotice(
  message: ChatMessage,
  notice: string,
  deliverableDetail: string,
  deliverableCode = 'incomplete_output',
): ChatMessage {
  const hasDurableError = hasPersistedRunErrorEvent(message.events ?? []);
  let next = hasDurableError
    ? message
    : attachPersistedChatError(message, deliverableDetail, deliverableCode);
  next = appendErrorStatusEvent(next, notice, AUTO_CONTINUE_STATUS_CODE);
  return {
    ...next,
    runStatus: 'failed',
    resumable: next.resumable ?? true,
    endedAt: next.endedAt ?? Date.now(),
  };
}

/** True when the message carries a durable, user-facing run-error status event. */
export function messageHasPersistedChatError(
  message: Pick<ChatMessage, 'events'>,
): boolean {
  return hasPersistedRunErrorEvent(message.events ?? []);
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
