// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

// Regression coverage for the "deck-stage shows a sliver of content in the
// top-left with the rest of the preview black" symptom. Root cause: the
// srcdoc deck bridge injected `place-content: center !important` on
// `.stage, .deck-stage, .deck-shell` for ALL deck-mode artifacts, even
// framework decks (DECK_SKELETON_HTML in apps/daemon/src/prompts/
// deck-framework.ts) whose `fit()` already centers a `transform-origin:
// top left` stage with an explicit `translate(tx, ty)` that assumes the
// stage's natural layout position is (0, 0). Forcing place-content on
// the shell re-centered the implicit grid track, doubled the offset, and
// pushed the scaled stage off-screen.
//
// The fix: detect the framework deck via its `id="deck-stage"` marker and
// skip the `data-od-deck-fix` styleFix for it. Legacy / non-framework
// decks that authored their own `.stage` grid still get the override.

function frameworkDeckHtml(): string {
  return [
    '<!doctype html><html><head><style>',
    '.deck-shell { position: fixed; inset: 0; overflow: hidden; }',
    '.deck-stage { width: 1920px; height: 1080px; position: relative; transform-origin: top left; }',
    '.slide { position: absolute; inset: 0; }',
    '.slide:not(.active) { display: none !important; }',
    '</style></head><body>',
    '<div class="deck-shell">',
    '  <div class="deck-stage" id="deck-stage">',
    '    <section class="slide active">slide 1</section>',
    '    <section class="slide">slide 2</section>',
    '  </div>',
    '</div>',
    '<script>(function(){ var stage = document.getElementById(\'deck-stage\'); /* fit() ... */ })();</script>',
    '</body></html>',
  ].join('\n');
}

function legacyDeckHtml(): string {
  return [
    '<!doctype html><html><head><style>',
    // A common authoring shape: `.stage` is the grid container with no
    // explicit fit() function. This is exactly what the deck-fix style
    // was designed for.
    '.stage { display: grid; place-items: center; width: 100vw; height: 100vh; overflow: hidden; }',
    '.canvas { width: 1920px; height: 1080px; transform-origin: center center; }',
    '.slide { display: none; }',
    '.slide.is-active { display: block; }',
    '</style></head><body>',
    '<div class="stage">',
    '  <div class="canvas">',
    '    <section class="slide is-active">slide 1</section>',
    '    <section class="slide">slide 2</section>',
    '  </div>',
    '</div>',
    '</body></html>',
  ].join('\n');
}

describe('injectDeckBridge — framework-deck detection (#deck-stage)', () => {
  it('skips the place-content fix when the deck carries the framework #deck-stage marker', () => {
    const out = buildSrcdoc(frameworkDeckHtml(), { deck: true });
    expect(out).not.toMatch(/<style[^>]*data-od-deck-fix/);
    expect(out).not.toContain('place-content: center !important');
    expect(out).not.toMatch(/<style[^>]*data-od-deck-layout-guard/);
    // The bridge script itself must still ship — the framework's own
    // fit() handles centering, but the host-side counter / keyboard
    // bridge still needs the slide-state postMessage channel.
    expect(out).toMatch(/<script[^>]*data-od-deck-bridge/);
    expect(out).toContain("data.type === 'od:deck-nudge-fit'");
    expect(out).toContain("data.type === 'od:deck-host-viewport'");
    expect(out).toContain('runFrameworkDeckFit');
    expect(out).toContain('reconcileFrameworkDeckFitSoon');
    expect(out).toContain('hostViewport.layoutFit');
    expect(out).toContain('User-zoom preview shells');
  });

  it('keeps injecting the place-content fix for legacy / non-framework decks', () => {
    const out = buildSrcdoc(legacyDeckHtml(), { deck: true });
    expect(out).toMatch(/<style[^>]*data-od-deck-fix/);
    expect(out).toContain('.stage, .deck-stage, .deck-shell { place-content: center !important; }');
    expect(out).toMatch(/<script[^>]*data-od-deck-bridge/);
  });

  it('skips the fix when #deck-stage uses single quotes, extra whitespace, or uppercase ID syntax', () => {
    // The detector should match the framework's emit shape but also
    // tolerate the minor formatting variations that DOMParser /
    // serializeHtmlDocument introduce in the middle of the pipeline.
    const variants = [
      `<div class="deck-stage" id='deck-stage'></div>`,
      `<div class="deck-stage" ID = "deck-stage"></div>`,
      `<div class="deck-stage" id = 'deck-stage'></div>`,
    ];
    for (const variant of variants) {
      const out = buildSrcdoc(`<!doctype html><html><body>${variant}</body></html>`, { deck: true });
      expect(out, `variant ${JSON.stringify(variant)}`).not.toContain('data-od-deck-fix');
    }
  });

  it('activates the initial slide on load when no slide is visible yet', () => {
    const out = buildSrcdoc(
      [
        '<!doctype html><html><head><style>',
        '.slide:not(.active) { display: none !important; }',
        '</style></head><body>',
        '<section class="slide">slide 1</section>',
        '<section class="slide">slide 2</section>',
        '</body></html>',
      ].join(''),
      { deck: true },
    );
    expect(out).toContain('var didRestoreInitialSlide = false;');
    expect(out).toContain('if (findActiveByVisibility(list) < 0) gotoIndex(target);');
  });

  it('injects stacked compact deck letterbox helpers for freeform body slides', () => {
    const out = buildSrcdoc(
      '<!doctype html><html><body><section class="slide" style="min-height:100vh">A</section></body></html>',
      { deck: true },
    );
    expect(out).toContain('#od-stacked-deck-stage');
    expect(out).toContain('data-od-stacked-deck');
    expect(out).toContain('function runStackedDeckFit');
    expect(out).toContain('function shouldUseStackedDeckStage');
    expect(out).toContain("data.type === 'od:preview-scroll-by'");
    expect(out).toContain("data.type === 'od:deck-pan-reset'");
    expect(out).toContain('function deckPanBy');
  });
});
