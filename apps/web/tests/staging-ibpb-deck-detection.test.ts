/**
 * Repro of staging bug (Bug2 navigation) with user-provided deck.html:
 * checks whether `looksLikeCompactApiStackedDeck` classifies ib-pitch-book
 * Clone output as compact-stacked AND whether the bridge stacked-stage
 * boot path can find the slides / track for nav.
 *
 * After 0826-N01-2 §F1-b lands, `buildTemplateClonedDeckHtml` hoists the
 * `<div class="stage">` flex-row wrapper out of the way so its slides sit
 * directly under `.deck`. That is the shape the host bridge picks up as
 * compact-stacked and can navigate via `display` toggle instead of the
 * broken `translateX` "nudge".
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildTemplateClonedDeckHtml,
  hoistCloneSlidesOutOfFlexTrack,
} from '@open-design/contracts';

import { buildSrcdoc } from '../src/runtime/srcdoc';

import {
  looksLikeCompactApiStackedDeck,
  looksLikeAuthoredHorizontalSwipeDeck,
  looksLikeCompactApiStackedDeckForPreview,
} from '../src/runtime/compact-api-stacked-deck';

const EXAMPLE_PATH = resolve(
  __dirname,
  '../../../plugins/_official/examples/ib-pitch-book/example.html',
);
const EXAMPLE_HTML = readFileSync(EXAMPLE_PATH, 'utf8');

// Fixture that mirrors the exact daemon Clone LOOK seed layout the user hit:
// `.deck > .stage > .slide` with min-width:1920px + inline width/height 1920px
// on each `<section class="slide">`.
const CLONE_LOOK_SEED = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>영어 회화 표현 공부 팁, 예시에</title>
<style>
  .deck { width: 1920px; height: 1080px; overflow: hidden; display: flex; flex-direction: column; }
  .stage { flex: 1 1 auto; min-height: 0; width: 100%; display: flex; transition: transform 480ms; will-change: transform; }
  .slide { min-width: 1920px; height: 1080px; display: grid; place-items: stretch; position: relative; overflow: hidden; }
</style>
<style data-teamver-template-clone-size>html,body{margin:0;padding:0;overflow:auto}.slide{width:1920px;height:1080px;min-height:1080px;max-height:1080px;box-sizing:border-box}</style>
</head>
<body>
<div class="deck" id="deck">
<div class="stage" id="stage">
<section class="slide cover" style="width:1920px;height:1080px;box-sizing:border-box"><h1>Slide 1</h1></section>
<section class="slide toc" style="width:1920px;height:1080px;box-sizing:border-box"><h2>Slide 2</h2></section>
<section class="slide comps" style="width:1920px;height:1080px;box-sizing:border-box"><h2>Slide 3</h2></section>
</div>
<div class="chrome">
  <button id="prev">‹</button>
  <span><span id="now">01</span> / <span id="total">03</span></span>
  <button id="next">›</button>
</div>
</div>
</body>
</html>`;

const USER_STAGING_DECK_PATH = '/tmp/user-staging-deck.html';
const USER_STAGING_DECK = readFileSync(USER_STAGING_DECK_PATH, 'utf8');

describe('staging ib-pitch-book Clone detection', () => {
  it('looksLikeAuthoredHorizontalSwipeDeck returns false for 1920px fixed slides', () => {
    // Current classifier only catches min-width: 100vw. Fixed-canvas 1920px
    // horizontal swipe decks slip through and get treated as compact-stacked.
    expect(looksLikeAuthoredHorizontalSwipeDeck(CLONE_LOOK_SEED)).toBe(false);
    expect(looksLikeAuthoredHorizontalSwipeDeck(EXAMPLE_HTML)).toBe(true);
  });

  it('looksLikeCompactApiStackedDeck returns true for the Clone seed', () => {
    expect(looksLikeCompactApiStackedDeck(CLONE_LOOK_SEED)).toBe(true);
  });

  it('detection on the actual user staging deck.html', () => {
    console.log('length:', USER_STAGING_DECK.length);
    console.log('horizontalSwipe(user staging):', looksLikeAuthoredHorizontalSwipeDeck(USER_STAGING_DECK));
    console.log('compactStacked(user staging):', looksLikeCompactApiStackedDeck(USER_STAGING_DECK));
    console.log('compactStackedForPreview(user staging):', looksLikeCompactApiStackedDeckForPreview(USER_STAGING_DECK));
    console.log('has id="deck":', /\bid\s*=\s*["']deck["']/i.test(USER_STAGING_DECK));
    console.log('has class="deck":', /class\s*=\s*["']deck["']/i.test(USER_STAGING_DECK));
    console.log('has transition:transform:', /transition\s*:\s*transform\b/i.test(USER_STAGING_DECK));
    console.log('has 1920px slide inline:', /width:1920px;height:1080px/i.test(USER_STAGING_DECK));
  });

  it('post-fix Clone HTML classifies as compact-stacked (nav works)', () => {
    // `buildTemplateClonedDeckHtml` now hoists the `<div class="stage">`
    // wrapper. The resulting HTML must classify as compact-stacked so the
    // host bridge navigates via `display` toggle rather than `translateX`.
    const cloned = buildTemplateClonedDeckHtml(EXAMPLE_HTML, [], {
      title: '영어 회화 표현 공부 팁, 예시에',
      maxSlides: 9,
    });
    expect(cloned).not.toBeNull();
    if (!cloned) return;
    // Wrapper is gone → no residual flex-row track.
    expect(/<div\b[^>]*\bid\s*=\s*["']stage["']/i.test(cloned)).toBe(false);
    expect(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bstage\b/i.test(cloned)).toBe(false);

    console.log('post-fix horizontalSwipe:', looksLikeAuthoredHorizontalSwipeDeck(cloned));
    console.log('post-fix compactStacked:', looksLikeCompactApiStackedDeck(cloned));
    console.log('post-fix compactStackedForPreview:', looksLikeCompactApiStackedDeckForPreview(cloned));

    // Slides now sit directly under `.deck`, so the classifier must accept
    // this as compact-stacked. Otherwise host-bridge nav falls back to
    // translate-track / native-scroll modes and the reported "nudge"
    // symptom returns.
    expect(looksLikeCompactApiStackedDeck(cloned)).toBe(true);
  });

  it('preview-hoists a persisted Clone leftover (no author script) to compact-stacked', () => {
    const hoisted = hoistCloneSlidesOutOfFlexTrack(CLONE_LOOK_SEED);
    expect(/<div\b[^>]*\bid\s*=\s*["']stage["']/i.test(hoisted)).toBe(false);
    expect(looksLikeCompactApiStackedDeck(hoisted)).toBe(true);

    const srcdoc = buildSrcdoc(CLONE_LOOK_SEED, { deck: true });
    expect(/<div\b[^>]*\bid\s*=\s*["']stage["']/i.test(srcdoc)).toBe(false);
    expect(looksLikeCompactApiStackedDeck(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''))).toBe(true);
  });
});
