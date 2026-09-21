import { recoverShortDeckByPaddingToSeed } from '@open-design/contracts';
import { looksLikeHeadOpenedDeckPreamble } from '../artifacts/deck-html-content';
import { STALLED_HEAD_PREAMBLE_STATUS_CODE } from './stalledRunDeckSalvage';

/** Hidden so ChatPane treats this like other auto-continue user turns. */
export const HEAD_PREAMBLE_CONTINUE_SENTINEL = '<!--od:head_preamble_continue-->';

const AUTO_CONTINUE_PROMPT_SENTINEL = '<!--od:auto_continue_incomplete_output-->';

/** Same user request: head-preamble continue fires at most once. */
export const HEAD_PREAMBLE_CONTINUE_MAX = 1;

export function isHeadPreambleContinuePrompt(content: string | null | undefined): boolean {
  return String(content ?? '').includes(HEAD_PREAMBLE_CONTINUE_SENTINEL);
}

export function looksLikeAbandonedHeadPreambleStub(text: string | null | undefined): boolean {
  const raw = String(text ?? '');
  if (!raw.trim()) return false;
  if (looksLikeHeadOpenedDeckPreamble(raw)) return true;
  return /head kit dump abandoned/i.test(raw)
    && !/<section\b[^>]*class=["'][^"']*\bslide\b/i.test(raw);
}

function assistantLooksLikeHeadPreambleSignal(
  message: { role?: string; content?: string | null; events?: readonly { code?: string | null }[] | null },
): boolean {
  if (message.role !== 'assistant') return false;
  if (looksLikeAbandonedHeadPreambleStub(message.content)) return true;
  return (message.events ?? []).some(
    (event) => event.code === STALLED_HEAD_PREAMBLE_STATUS_CODE,
  );
}

/**
 * Count head-preamble continues. Generic auto-continue after a head stall
 * counts too — otherwise api-proxy idle / stalledRun strip the head and
 * bypass the 1-continue guard via `<!--od:auto_continue_incomplete_output-->`.
 */
export function countHeadPreambleContinueAttempts(
  messages: readonly {
    role?: string;
    content?: string | null;
    events?: readonly { code?: string | null }[] | null;
  }[],
): number {
  let headSeen = false;
  let count = 0;
  for (const message of messages) {
    if (assistantLooksLikeHeadPreambleSignal(message)) headSeen = true;
    if (message.role !== 'user') continue;
    if (isHeadPreambleContinuePrompt(message.content)) {
      count += 1;
      headSeen = true;
      continue;
    }
    if (headSeen && String(message.content ?? '').includes(AUTO_CONTINUE_PROMPT_SENTINEL)) {
      count += 1;
    }
  }
  return count;
}

export function countHeadPreambleBannerEmits(
  messages: readonly { events?: readonly { code?: string | null }[] | null }[],
): number {
  return messages.reduce((count, message) => {
    const extra = (message.events ?? []).filter(
      (event) => event.code === STALLED_HEAD_PREAMBLE_STATUS_CODE,
    ).length;
    return count + extra;
  }, 0);
}

/** N28 — never show the Korean head-stall banner. Continue still runs silently. */
export function shouldEmitHeadPreambleBanner(_priorEmits?: number): boolean {
  return false;
}

export function decideHeadPreambleRecovery(input: {
  streamedText: string;
  priorHeadPreambleContinues: number;
  treatAsHeadPreamble?: boolean;
}): 'continue' | 'fallback' | 'none' {
  const headLike = looksLikeAbandonedHeadPreambleStub(input.streamedText)
    || input.treatAsHeadPreamble === true;
  if (!headLike) return 'none';
  if (input.priorHeadPreambleContinues >= HEAD_PREAMBLE_CONTINUE_MAX) return 'fallback';
  return 'continue';
}

export function shouldBlockSecondHeadPreambleContinue(input: {
  stillHeadPreamble: boolean;
  priorHeadPreambleContinues: number;
}): boolean {
  return input.stillHeadPreamble
    && input.priorHeadPreambleContinues >= HEAD_PREAMBLE_CONTINUE_MAX;
}

/**
 * Body-only continue. Do not re-send kit CSS — that re-anchors MiniMax on
 * `<head>` and stalls again.
 */
export function buildHeadPreambleContinuePrompt(): string {
  return [
    AUTO_CONTINUE_PROMPT_SENTINEL,
    HEAD_PREAMBLE_CONTINUE_SENTINEL,
    '</head> already emitted. Output ONLY <body> slides starting with <section class="slide".',
    'Do not emit <!doctype>, <html>, <head>, or kit CSS again.',
    'Close </body></html></artifact> this turn.',
  ].join('\n');
}

/** Persist 직전 강제 pad. continue 경로가 이 호출을 건너뛰면 버그. */
export function persistPadShortDeckToSeed(input: {
  modelHtml: string;
  seedHtml: string | null | undefined;
  templateId?: string | null;
  brief?: string | null;
  deckTitle?: string | null;
}): {
  html: string;
  producedCount: number;
  paddedCount: number;
  seedCount: number;
} | null {
  const seedHtml = String(input.seedHtml ?? '').trim();
  const modelHtml = String(input.modelHtml ?? '').trim();
  if (!seedHtml || !modelHtml) return null;
  return recoverShortDeckByPaddingToSeed({
    seedHtml,
    modelHtml,
    ...(input.templateId != null ? { templateId: input.templateId } : {}),
    ...(input.brief != null ? { brief: input.brief } : {}),
    ...(input.deckTitle != null ? { deckTitle: input.deckTitle } : {}),
    forcePad: true,
  });
}
