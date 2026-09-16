import { looksLikeHeadOpenedDeckPreamble } from '../artifacts/deck-html-content';

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
  // 루프529 — Partial HTML was salvaged and persisted as succeeded (like
  // emergency salvage). Do not promise a Retry dock button that only renders
  // for `runStatus === 'failed'`. Point users to chat continue / review.
  return '생성이 중간에 멈춰, 그때까지 만들어진 슬라이드를 저장했습니다. 내용을 확인한 뒤, 채팅에서 이어서 요청해 주세요.';
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
  // Head/CSS-only dumps are not slides. Salvaging them overwrites LOOK seed
  // and trains auto-continue to keep writing `<head>`.
  if (looksLikeHeadOpenedDeckPreamble(text)) return null;
  return text;
}

export const STALLED_HEAD_PREAMBLE_STATUS_CODE = 'stalled_head_preamble';

export function formatStalledHeadPreambleNotice(): string {
  return '생성이 HTML 머리글에서 멈춰, 슬라이드 본문부터 이어서 작성합니다.';
}

/**
 * 루프540 — `<artifact>` + `<head>` stub is too thin to save, but it must
 * still enter the incomplete-shell finalize/auto-continue path. Otherwise
 * the first request dies on keepalive and the user has to send 2nd/3rd turns.
 */
export function stalledRunHeadPreambleText(input: {
  errorCode?: string | null;
  errorDetail?: string | null;
  slideOnlyMvp: boolean;
  streamedText?: string | null;
}): string | null {
  if (!input.slideOnlyMvp) return null;
  if (!looksLikeStalledRunError(input)) return null;
  if (stalledRunPartialDeckText(input)) return null;
  const text = String(input.streamedText ?? '');
  if (!looksLikeHeadOpenedDeckPreamble(text)) return null;
  return text;
}
