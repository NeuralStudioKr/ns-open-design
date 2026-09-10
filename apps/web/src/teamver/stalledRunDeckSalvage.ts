/**
 * 루프477 — A stalled BYOK deck run (AGENT_EXECUTION_STALLED) used to discard the
 * HTML it had already streamed: onError never reached the terminal salvage /
 * auto-continue pipeline. Decide here whether the streamed text is worth routing
 * into that pipeline instead of painting a bare failure card.
 *
 * 루프491 — Daemon watchdog historically emitted AGENT_EXECUTION_FAILED with the
 * "Agent stalled without emitting…" message. Accept that shape too so salvage
 * works against older daemon builds.
 */

export const STALLED_PARTIAL_DECK_STATUS_CODE = 'stalled_partial_deck';

/** Below this the stream is a bare `<artifact>` / `<head>` stub — nothing to save. */
export const STALLED_PARTIAL_DECK_MIN_CHARS = 400;

const STALL_ERROR_CODE = 'AGENT_EXECUTION_STALLED';
const DAEMON_STALL_FAILED_CODE = 'AGENT_EXECUTION_FAILED';
const DAEMON_STALL_MESSAGE_RE = /Agent stalled without emitting/i;
const DECK_DOCUMENT_START_RE = /<!doctype\s+html|<html[\s>]/i;

export function formatStalledPartialDeckNotice(): string {
  return '생성이 중간에 멈춰, 그때까지 만들어진 슬라이드를 저장했습니다. 이어서 만들거나 다시 시도해 주세요.';
}

export function looksLikeStalledRunError(input: {
  errorCode?: string | null;
  errorDetail?: string | null;
}): boolean {
  const code = String(input.errorCode ?? '').trim();
  if (code === STALL_ERROR_CODE) return true;
  if (code !== DAEMON_STALL_FAILED_CODE) return false;
  return DAEMON_STALL_MESSAGE_RE.test(String(input.errorDetail ?? ''));
}

/**
 * Streamed text to hand to the terminal finalize pipeline, or `null` when the
 * stall should keep the plain failure path.
 */
export function stalledRunPartialDeckText(input: {
  errorCode?: string | null;
  errorDetail?: string | null;
  slideOnlyMvp: boolean;
  streamedText?: string | null;
}): string | null {
  if (!input.slideOnlyMvp) return null;
  if (!looksLikeStalledRunError(input)) return null;
  const text = String(input.streamedText ?? '');
  if (text.length < STALLED_PARTIAL_DECK_MIN_CHARS) return null;
  if (!DECK_DOCUMENT_START_RE.test(text)) return null;
  return text;
}
