/**
 * 루프550 — create/full fill에서 seed vs 반환 장 수가 크게 벌어지면
 * pad 전에 MiniMax를 1회 재호출할지 결정한다.
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

export function isShortResponseAutoRetryPrompt(text: string | null | undefined): boolean {
  const value = String(text ?? '');
  return (
    /The previous response returned only \d+ slides/i.test(value)
    && /Return EXACTLY \d+ <section class="slide">/i.test(value)
  );
}
