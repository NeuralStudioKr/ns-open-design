/**
 * 루프550 — create/full fill에서 seed vs 반환 장 수가 크게 벌어지면
 * pad 전에 MiniMax를 1회 재호출할지 결정한다.
 *
 * 루프552 — 같은 카운터로 `<64` 초단 HTML(저장 거절)도 1회 재시도한다.
 */

export type ShortResponseAutoRetryInput = {
  seedCount: number;
  returnedCount: number;
  requestedSlideCount: number | null;
  alreadyRetried: boolean;
  scopedEdit: boolean;
  isCreateOrFullFill: boolean;
};

function finiteSlideCount(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n > 0 ? n : null;
}

/** 10→2, 5→1 처럼 seed 대비 절반 이하이거나 3장 이상 빠진 단축. */
export function isLargeSlideCountShortfall(input: {
  seedCount: number;
  returnedCount: number;
}): boolean {
  const seedCount = finiteSlideCount(input.seedCount);
  const returnedCount = finiteSlideCount(input.returnedCount) ?? 0;
  if (seedCount == null || returnedCount <= 0) return false;
  if (returnedCount >= seedCount) return false;
  const dropped = seedCount - returnedCount;
  return returnedCount <= Math.floor(seedCount * 0.5) || dropped >= 3;
}

export function shouldAutoRetryShortSlideResponse(
  input: ShortResponseAutoRetryInput,
): boolean {
  if (input.alreadyRetried) return false;
  if (input.scopedEdit) return false;
  if (!input.isCreateOrFullFill) return false;
  if (finiteSlideCount(input.requestedSlideCount) == null) return false;
  return isLargeSlideCountShortfall({
    seedCount: input.seedCount,
    returnedCount: input.returnedCount,
  });
}

export function renderShortResponseAutoRetryPrompt(input: {
  returnedCount: number;
  seedCount: number;
}): string {
  const returnedCount = Math.max(0, Math.floor(input.returnedCount));
  const seedCount = Math.max(1, Math.floor(input.seedCount));
  return (
    `The previous response returned only ${returnedCount} slides. `
    + `Seed contains ${seedCount} slides. `
    + `Return EXACTLY ${seedCount} <section class="slide">.`
  );
}

export type TooShortHtmlSnippetKind =
  | 'empty'
  | 'self-talk'
  | 'empty-html-shell'
  | 'prose'
  | 'other';

export function classifyTooShortHtmlSnippet(content: string): {
  length: number;
  kind: TooShortHtmlSnippetKind;
  preview: string;
} {
  const trimmed = String(content ?? '').replace(/^\uFEFF/, '').trim();
  const preview = trimmed.slice(0, 48);
  if (!trimmed) return { length: 0, kind: 'empty', preview: '' };
  if (/^<(?:!doctype\s+html\b|html\b)/i.test(trimmed)) {
    return { length: trimmed.length, kind: 'empty-html-shell', preview };
  }
  if (
    /^(?:i(?:'ll| will)|let me|ok(?:ay)?\b|sure[.!]?\s|알겠어|생성하|만들게|슬라이드를\s*생성)/i
      .test(trimmed)
  ) {
    return { length: trimmed.length, kind: 'self-talk', preview };
  }
  if (!trimmed.includes('<')) {
    return { length: trimmed.length, kind: 'prose', preview };
  }
  return { length: trimmed.length, kind: 'other', preview };
}

export type TooShortHtmlPersistRecovery = 'retry' | 'keep-seed' | 'reject' | 'scoped';

/**
 * 32자/`<64` HTML persist 결정. 짧은 본문은 절대 저장하지 않는다.
 * retry → 루프550과 같은 1회 재호출. keep-seed → LOOK seed/prior 유지.
 */
export function decideTooShortHtmlPersistRecovery(input: {
  alreadyRetried: boolean;
  scopedEdit: boolean;
  isCreateOrFullFill: boolean;
  hasLookSeed: boolean;
  hasPrior: boolean;
}): TooShortHtmlPersistRecovery {
  if (input.scopedEdit) return 'scoped';
  const hasKeep = input.hasLookSeed || input.hasPrior;
  if (input.isCreateOrFullFill && hasKeep && !input.alreadyRetried) return 'retry';
  if (input.hasLookSeed) return 'keep-seed';
  if (input.hasPrior && input.isCreateOrFullFill) return 'keep-seed';
  return 'reject';
}

export function shouldAutoRetryTooShortHtmlResponse(input: {
  alreadyRetried: boolean;
  scopedEdit: boolean;
  isCreateOrFullFill: boolean;
  hasLookSeedOrPrior: boolean;
}): boolean {
  return decideTooShortHtmlPersistRecovery({
    alreadyRetried: input.alreadyRetried,
    scopedEdit: input.scopedEdit,
    isCreateOrFullFill: input.isCreateOrFullFill,
    hasLookSeed: input.hasLookSeedOrPrior,
    hasPrior: input.hasLookSeedOrPrior,
  }) === 'retry';
}

export function renderTooShortHtmlAutoRetryPrompt(input: {
  charCount: number;
  seedCount?: number | null;
  previousSnippet?: string | null;
}): string {
  const charCount = Math.max(0, Math.floor(input.charCount));
  const seedCount = finiteSlideCount(input.seedCount ?? null);
  const preview = String(input.previousSnippet ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
  const countLine = seedCount != null
    ? ` Return EXACTLY ${seedCount} <section class="slide"> in a complete <!doctype html> deck.`
    : ' Emit a complete <!doctype html> deck now.';
  const previewLine = preview
    ? ` Previous output preview: "${preview}".`
    : '';
  return (
    `The previous output was not HTML (got ${charCount} chars, need ≥64).`
    + ' Do not reply with status prose, self-talk, or an empty <html> shell.'
    + countLine
    + previewLine
  );
}

export function parseTooShortHtmlCharCount(reason: string | null | undefined): number {
  const match = /got\s+(\d+)\s+chars/i.exec(String(reason ?? ''));
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function isShortResponseAutoRetryPrompt(text: string | null | undefined): boolean {
  const value = String(text ?? '');
  if (/The previous output was not HTML/i.test(value)) return true;
  return (
    /The previous response returned only \d+ slides/i.test(value)
    && /Return EXACTLY \d+ <section class="slide">/i.test(value)
  );
}
