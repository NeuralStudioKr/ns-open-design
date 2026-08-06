/**
 * Shared message upsert merge for SQLite + Postgres.
 *
 * Keepalive / stale streaming-buffer PUTs may omit or empty `events`, or send a
 * non-empty events array that still lacks a previously persisted status:error
 * card. Preserve those durable error events so hard re-entry can rebuild the
 * chat error UI from the server row alone.
 */

export type MessageUpsertRow = {
  events?: unknown[] | undefined;
  runStatus?: unknown;
  endedAt?: unknown;
  commentAttachments?: unknown[] | undefined;
  attachments?: unknown[] | undefined;
  sessionMode?: unknown;
  runContext?: unknown;
  appliedPluginSnapshot?: unknown;
  preTurnFileNames?: unknown[] | undefined;
  producedFiles?: unknown[] | undefined;
  slideTurnKind?: unknown;
  feedback?: unknown;
  [key: string]: unknown;
};

function mergeSlideTurnKind(
  incoming: unknown,
  existing: unknown,
): 'create' | 'edit' | undefined {
  if (incoming === 'create' || incoming === 'edit') return incoming;
  if (existing === 'create' || existing === 'edit') return existing;
  return undefined;
}

/** Non-fatal status:error codes that must not force runStatus back to failed. */
export const NON_FATAL_CHAT_ERROR_CODES = new Set([
  'auto_continue_incomplete_output',
  'emergency_deck_fallback',
]);

/**
 * Any status:error with detail — including transient auto-continue notices.
 * Used when merging events so a later streaming PUT cannot erase the notice
 * (or the durable incomplete_output beneath it) before hard reload.
 */
export function isPreservedChatErrorEvent(event: unknown): boolean {
  if (!event || typeof event !== 'object') return false;
  const row = event as { kind?: unknown; label?: unknown; detail?: unknown };
  if (row.kind !== 'status' || row.label !== 'error') return false;
  return typeof row.detail === 'string' && Boolean(row.detail.trim());
}

/** Fatal/user-facing status:error — excludes auto-continue / emergency notices. */
export function isDurableChatErrorEvent(event: unknown): boolean {
  if (!isPreservedChatErrorEvent(event)) return false;
  const row = event as { code?: unknown };
  if (typeof row.code === 'string' && NON_FATAL_CHAT_ERROR_CODES.has(row.code)) return false;
  return true;
}

export function chatErrorEventKey(event: unknown): string {
  const row = event as { detail?: unknown; code?: unknown };
  return `${String(row.detail ?? '')}\0${String(row.code ?? '')}`;
}

export function mergeOptionalMessageArrayField<T>(
  incoming: T[] | undefined,
  existing: T[] | undefined,
): T[] | undefined {
  if (incoming === undefined) return existing;
  if (incoming.length === 0 && (existing?.length ?? 0) > 0) return existing;
  return incoming;
}

export function mergeMessageEvents(
  incoming: unknown[] | undefined,
  existing: unknown[] | undefined,
): unknown[] | undefined {
  if (incoming === undefined) return existing;
  if (incoming.length === 0 && (existing?.length ?? 0) > 0) return existing;
  if (!existing?.length) return incoming;
  const incomingKeys = new Set(
    incoming.filter(isPreservedChatErrorEvent).map(chatErrorEventKey),
  );
  const missing = existing.filter(
    (event) => isPreservedChatErrorEvent(event) && !incomingKeys.has(chatErrorEventKey(event)),
  );
  if (missing.length === 0) return incoming;
  return [...incoming, ...missing];
}

export function mergeMessageUpsertPayload<T extends MessageUpsertRow>(
  existing: T | undefined,
  incoming: T,
): T {
  if (!existing) return incoming;
  const events = mergeMessageEvents(
    incoming.events as unknown[] | undefined,
    existing.events as unknown[] | undefined,
  ) as T['events'];
  let runStatus = incoming.runStatus;
  // Restored durable error cards must stay failed so ChatPane can rebuild the
  // diagnostic after hard reload (ephemeral React `error` is cleared on load).
  if (
    Array.isArray(events)
    && events.some(isDurableChatErrorEvent)
    && runStatus !== 'canceled'
    && runStatus !== 'failed'
  ) {
    runStatus = 'failed';
  }
  return {
    ...incoming,
    runStatus,
    endedAt: runStatus === 'failed'
      ? (incoming.endedAt ?? existing.endedAt ?? Date.now())
      : incoming.endedAt,
    events,
    commentAttachments: mergeOptionalMessageArrayField(
      incoming.commentAttachments as unknown[] | undefined,
      existing.commentAttachments as unknown[] | undefined,
    ),
    attachments: mergeOptionalMessageArrayField(
      incoming.attachments as unknown[] | undefined,
      existing.attachments as unknown[] | undefined,
    ),
    sessionMode: incoming.sessionMode ?? existing.sessionMode,
    runContext: incoming.runContext ?? existing.runContext,
    appliedPluginSnapshot: incoming.appliedPluginSnapshot ?? existing.appliedPluginSnapshot,
    preTurnFileNames: mergeOptionalMessageArrayField(
      incoming.preTurnFileNames as unknown[] | undefined,
      existing.preTurnFileNames as unknown[] | undefined,
    ),
    // Empty arrays from early shells / keepalive-adjacent PUTs must not wipe
    // durable deliverable evidence used to keep completion leads after reload.
    producedFiles: mergeOptionalMessageArrayField(
      incoming.producedFiles as unknown[] | undefined,
      existing.producedFiles as unknown[] | undefined,
    ),
    slideTurnKind: mergeSlideTurnKind(incoming.slideTurnKind, existing.slideTurnKind),
    feedback: incoming.feedback ?? existing.feedback,
  };
}
