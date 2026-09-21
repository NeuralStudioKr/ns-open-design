/**
 * Home create auto-send must fire once per project, even if the effect
 * re-runs before the stream's AbortController exists.
 *
 * ProjectView used to restore `od:auto-send-first` whenever cleanup ran and
 * `abortRef` was still empty. `handleSend` does file refresh and LOOK-seed
 * reads before it sets that abort, so a metadata/handleSend identity change
 * re-armed a second first stream. Both land as identical user bubbles.
 *
 * The module claim does not survive a reload. Never restore the session
 * flag after a user row is already visible — that replayed the same request.
 */

const claimedProjectIds = new Set<string>();
const firstTurnStartedAt = new Map<string, number>();

export function createAutoSendClaimHeld(
  projectId: string,
  claims: Set<string> = claimedProjectIds,
): boolean {
  return claims.has(projectId);
}

/** Returns false when this project already owns an in-flight or finished create send. */
export function claimCreateAutoSend(
  projectId: string,
  claims: Set<string> = claimedProjectIds,
): boolean {
  if (claims.has(projectId)) return false;
  claims.add(projectId);
  return true;
}

export function releaseCreateAutoSendClaim(
  projectId: string,
  claims: Set<string> = claimedProjectIds,
): void {
  claims.delete(projectId);
}

/**
 * Cleanup may restore the session flag only when this effect never entered
 * handleSend. A dispatched send must stay latched until it fails cleanly.
 */
/**
 * Second line of defense inside handleSend. Effect cleanup can release the
 * session flag before abortRef exists; this lock is set synchronously on the
 * first create turn and is not released by that cleanup.
 *
 * Returns false when this project already started a create turn in the window.
 */
export function releaseFirstConversationTurn(
  projectId: string,
  startedAt: Map<string, number> = firstTurnStartedAt,
): void {
  startedAt.delete(projectId);
}

export function beginFirstConversationTurn(input: {
  projectId: string;
  entryFrom?: string | null;
  localUserCount: number;
  now?: number;
  windowMs?: number;
}, startedAt: Map<string, number> = firstTurnStartedAt): boolean {
  // Composer follow-ups and auto-continue have no create entry. Do not
  // hold them behind the home-create window.
  if (input.entryFrom !== 'new_project') return true;
  if (input.localUserCount > 0) return false;
  const now = input.now ?? Date.now();
  const windowMs = input.windowMs ?? 90_000;
  const started = startedAt.get(input.projectId);
  if (started != null && now - started < windowMs) return false;
  startedAt.set(input.projectId, now);
  return true;
}

export function shouldRearmCreateAutoSend(input: {
  autoSent: boolean;
  dispatched: boolean;
  abortActive: boolean;
}): boolean {
  if (input.autoSent || input.dispatched || input.abortActive) return false;
  return true;
}

/** A visible user row means the create request already left the client. */
export function shouldRetryFailedCreateAutoSend(input: {
  messageCount: number;
  abortActive: boolean;
  streamingThisConversation: boolean;
  embedSubmitDisabled: boolean;
  retryCount: number;
  maxRetries: number;
}): boolean {
  if (input.messageCount > 0) return false;
  if (input.abortActive || input.streamingThisConversation) return false;
  if (input.embedSubmitDisabled) return false;
  if (input.retryCount >= input.maxRetries) return false;
  return true;
}
