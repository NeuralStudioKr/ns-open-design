import type { ManualEditRect, ManualEditTarget } from './types';

export function rectsIntersect(a: ManualEditRect, b: ManualEditRect): boolean {
  return (
    a.x + a.width > b.x
    && a.y + a.height > b.y
    && a.x < b.x + b.width
    && a.y < b.y + b.height
  );
}

/**
 * Layer list targets — narrower than the full edit catalog.
 * Deck: active slide only. Other docs: viewport-visible elements only.
 */
export function filterManualEditLayerTargets(
  targets: readonly ManualEditTarget[],
  options: {
    deck?: boolean;
    activeSlideIndex?: number | null;
    viewportBounds?: ManualEditRect | null;
  },
): ManualEditTarget[] {
  let filtered = targets.filter((target) => !target.isHidden);

  if (options.deck && typeof options.activeSlideIndex === 'number') {
    filtered = filtered.filter(
      (target) => target.slideIndex === undefined || target.slideIndex === options.activeSlideIndex,
    );
  } else if (options.viewportBounds) {
    const viewport = options.viewportBounds;
    filtered = filtered.filter((target) => rectsIntersect(target.rect, viewport));
  }

  return filtered;
}
