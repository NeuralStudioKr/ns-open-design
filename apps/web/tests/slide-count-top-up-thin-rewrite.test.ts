import { describe, expect, it } from 'vitest';
import {
  deckLooksLikeThinTopUpHostPrior,
  isSalvageableThinPriorArtifact,
  hasFilledSlideSection,
} from '../src/artifacts/deck-html-content';
import {
  SLIDE_COUNT_TOP_UP_ENTRY_FROM,
  SPARSE_CONTENT_TOP_UP_ENTRY_FROM,
  buildThinPriorFullRewritePrompt,
  isSoftImprovementAutomationEntryFrom,
  isThinPriorFullRewritePrompt,
  shouldBlockSlideCountAppendOntoThinPrior,
  shouldQueueSlideCountTopUp,
  shouldQueueThinPriorFullRewrite,
  shouldSurfaceThinPriorRewriteExhaustedError,
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

describe('1007-N01 M thin_prior_rewrite_exhausted salvage', () => {
  const lStretchCss = [
    '<style data-od-sparse-g2-fill="">',
    'body.tpl-product-launch .slide>[data-od-slide-flow]{min-height:100%!important;height:100%!important}',
    '.card{flex:1 1 auto!important;min-height:clamp(240px,36%,420px)!important}',
    '</style>',
  ].join('');

  function coverOnlyWithStretchCss(title = '논리적 설득력의 비밀'): string {
    return [
      '<!doctype html><html lang="ko"><head></head><body class="tpl-product-launch">',
      '<section class="slide s-cover">',
      `<div data-od-slide-flow=""><h1 class="title">${title}</h1></div>`,
      '</section>',
      lStretchCss,
      '</body></html>',
    ].join('');
  }

  function emptyStretchedBoxesHtml(): string {
    return [
      '<!doctype html><html lang="ko"><body class="tpl-product-launch">',
      '<section class="slide s-cover"><div data-od-slide-flow=""><h1 class="title">표지</h1></div></section>',
      '<section class="slide dark">',
      '<div data-od-slide-flow="" style="min-height:100%;height:100%">',
      '<div class="card" style="min-height:clamp(240px,36%,420px);border:1px solid red"></div>',
      '</div></section>',
      lStretchCss,
      '</body></html>',
    ].join('');
  }

  function sparseOnTopicWithStretchCss(): string {
    return [
      '<!doctype html><html lang="ko"><body class="tpl-product-launch">',
      '<section class="slide s-cover">',
      '<div data-od-slide-flow=""><h1 class="title">논리적 설득력의 비밀</h1>',
      '<p>독자가 한 문장에서 이탈하는 이유를 먼저 고른다.</p></div></section>',
      '<section class="slide">',
      '<div data-od-slide-flow=""><div class="grid g2">',
      '<div><h2>데이터</h2><p>웹 독자의 평균 이탈 결정 시간은 짧다.</p></div>',
      '<div><h2>사례</h2><p>첫 문단이 약속을 지키지 않으면 닫힌다.</p></div>',
      '</div></div></section>',
      lStretchCss,
      '</body></html>',
    ].join('');
  }

  it('reproduces exhausted gate on cover-only after one rewrite, then salvages', () => {
    const cover = coverOnlyWithStretchCss();
    expect(deckLooksLikeThinTopUpHostPrior(cover)).toBe(true);
    expect(isSalvageableThinPriorArtifact(cover)).toBe(true);
    expect(shouldBlockSlideCountAppendOntoThinPrior({
      thinPrior: true,
      rewriteCount: 1,
    })).toBe(true);
    // Pre-M behavior: this combination painted surface-chat-error.
    expect(shouldSurfaceThinPriorRewriteExhaustedError({
      thinPrior: true,
      rewriteCount: 1,
      salvageableArtifact: false,
    })).toBe(true);
    // M: salvageable cover must not become a fatal exhausted error.
    expect(shouldSurfaceThinPriorRewriteExhaustedError({
      thinPrior: true,
      rewriteCount: 1,
      salvageableArtifact: isSalvageableThinPriorArtifact(cover),
    })).toBe(false);
  });

  it('keeps title-only cover + empty hosts salvageable (not fatal)', () => {
    const hollow = emptyStretchedBoxesHtml();
    expect(deckLooksLikeThinTopUpHostPrior(hollow)).toBe(true);
    expect(hasFilledSlideSection(hollow)).toBe(false);
    expect(isSalvageableThinPriorArtifact(hollow)).toBe(true);
    expect(shouldSurfaceThinPriorRewriteExhaustedError({
      thinPrior: true,
      rewriteCount: 1,
      salvageableArtifact: isSalvageableThinPriorArtifact(hollow),
    })).toBe(false);
  });

  it('does not classify CSS-stretched empty boxes as filled', () => {
    expect(hasFilledSlideSection(emptyStretchedBoxesHtml())).toBe(false);
    expect(deckLooksLikeThinTopUpHostPrior(emptyStretchedBoxesHtml())).toBe(true);
  });

  it('does not classify a sparse-but-on-topic deck as thin even with L CSS', () => {
    const sparse = sparseOnTopicWithStretchCss();
    expect(hasFilledSlideSection(sparse)).toBe(true);
    expect(deckLooksLikeThinTopUpHostPrior(sparse)).toBe(false);
    expect(shouldSurfaceThinPriorRewriteExhaustedError({
      thinPrior: false,
      rewriteCount: 1,
      salvageableArtifact: true,
    })).toBe(false);
  });

  it('rewrite prompt continues body fill instead of restarting from cover', () => {
    const prompt = buildThinPriorFullRewritePrompt({
      hostCount: 1,
      requested: 8,
      userBrief: '논리적 설득력의 비밀 슬라이드',
    });
    expect(isThinPriorFullRewritePrompt(prompt)).toBe(true);
    expect(prompt).toMatch(/Keep the saved cover slide/i);
    expect(prompt).toMatch(/CONTINUE from the saved cover/i);
    expect(prompt).not.toMatch(/REWRITE the entire deck/i);
    expect(isThinPriorFullRewritePrompt(
      'CONTINUE from the saved cover: emit that cover plus filled body slides',
    )).toBe(true);
  });
});
