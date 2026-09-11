import { describe, expect, it } from 'vitest';
import { deckLooksLikeThinTopUpHostPrior } from '../src/artifacts/deck-html-content';
import {
  SLIDE_COUNT_TOP_UP_ENTRY_FROM,
  SPARSE_CONTENT_TOP_UP_ENTRY_FROM,
  isSoftImprovementAutomationEntryFrom,
  shouldQueueSlideCountTopUp,
  shouldQueueThinPriorFullRewrite,
} from '../src/teamver/slideCountTopUp';

/** Block Frame–style: official look CSS for 10 slides, body is cover-only. */
function blockFrameCoverOnlyHtml(title = '팀버 소개'): string {
  return [
    '<!doctype html><html lang="ko"><head></head><body>',
    '<section class="slide slide-1 slide-title">',
    '<div data-od-slide-flow="">',
    '<div class="hero-frame">',
    '<div class="nb-label hero-label">표지</div>',
    `<h1 class="nb-heading-xl hero-title">${title}</h1>`,
    '</div></div></section>',
    '<style data-od-official-look-css="">',
    '.slide-1 .hero-title{} .slide-2{} .slide-10 .close-title{}',
    '</style>',
    '</body></html>',
  ].join('');
}

describe('루프502 thin prior 1-slide rewrite', () => {
  it('classifies Block Frame cover-only as thin prior', () => {
    expect(deckLooksLikeThinTopUpHostPrior(blockFrameCoverOnlyHtml())).toBe(true);
  });

  it('queues full rewrite for a solo thin cover (not only ≥3 hosts)', () => {
    expect(
      shouldQueueThinPriorFullRewrite({
        hostCount: 1,
        thinPrior: true,
        rewriteCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldQueueThinPriorFullRewrite({
        hostCount: 2,
        thinPrior: true,
        rewriteCount: 0,
      }),
    ).toBe(true);
  });

  it('does not rewrite when the user honored exactly 1 page', () => {
    expect(
      shouldQueueThinPriorFullRewrite({
        hostCount: 1,
        thinPrior: true,
        rewriteCount: 0,
        requested: 1,
      }),
    ).toBe(false);
  });

  it('still allows default append top-up when not thin', () => {
    expect(
      shouldQueueSlideCountTopUp({
        produced: 1,
        requested: null,
        defaultRequested: 6,
        topUpCount: 0,
      }),
    ).toBe(true);
  });

  it('루프503 queues top-up for 1-slide persist when user requested 8–10 (no defaultRequested)', () => {
    expect(
      shouldQueueSlideCountTopUp({
        produced: 1,
        requested: 10,
        requestedMin: 8,
        topUpCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldQueueSlideCountTopUp({
        produced: 2,
        requested: 15,
        topUpCount: 0,
      }),
    ).toBe(true);
  });

  it('루프503 does not silence slide-count top-up failures as soft-improvement', () => {
    expect(isSoftImprovementAutomationEntryFrom(SLIDE_COUNT_TOP_UP_ENTRY_FROM)).toBe(false);
    expect(isSoftImprovementAutomationEntryFrom(SPARSE_CONTENT_TOP_UP_ENTRY_FROM)).toBe(true);
  });
});
