export type DeckSlideIndexSource = {
  payloadSlideIndex?: number | null;
  slideStateActive?: number | null;
  cachedSlideActive?: number | null;
};

export function resolveDeckSlideIndex(source: DeckSlideIndexSource): number | undefined {
  const candidates = [
    source.payloadSlideIndex,
    source.slideStateActive,
    source.cachedSlideActive,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 0) {
      return candidate;
    }
  }
  return undefined;
}

export function withResolvedDeckSlideIndex<T extends { slideIndex?: number }>(
  target: T,
  source: Omit<DeckSlideIndexSource, 'payloadSlideIndex'>,
): T {
  const resolved = resolveDeckSlideIndex({
    ...source,
    payloadSlideIndex: target.slideIndex,
  });
  if (resolved === undefined || target.slideIndex === resolved) return target;
  return { ...target, slideIndex: resolved };
}
