// @vitest-environment jsdom
//
// Behavioural coverage for the artifact-type salvage helpers used in
// `persistArtifact` (see `apps/web/src/components/ProjectView.tsx`).
//
// The scoped-comment persist pipeline is fed by three artifact
// wrappers — `element-patch`, `deck-patch`, and plain `deck` — and
// the model occasionally puts the wrong content shape inside the
// wrong wrapper (off-by-one artifact-type glitch). Rather than
// rejecting these responses with a scary "선택 대상 밖 변경"
// banner, the client tries to salvage them:
//
//   - `<artifact type="element-patch">` carrying `<section class="slide">`
//     content → route through the deck-patch pipeline.
//   - `<artifact type="deck-patch">` carrying only `<patch>` blocks
//     → route through the element-patch pipeline.
//
// Empty artifact bodies of either type route through
// `skipped-incomplete` when the run has a scoped comment attachment
// (auto-continue will retry with the same scope). This suite pins
// the predicate behaviour so a future refactor cannot silently drop
// either salvage.

import { describe, expect, it } from 'vitest';
import {
  deckPatchBodyLooksLikeElementPatch,
  elementPatchBodyLooksLikeDeckPatch,
  isDeckPatchEmptyBody,
  isElementPatchEmptyBody,
} from '../src/components/ProjectView';

describe('elementPatchBodyLooksLikeDeckPatch', () => {
  it('matches an element-patch body that actually contains a <section class="slide">', () => {
    expect(
      elementPatchBodyLooksLikeDeckPatch(
        '<section class="slide" data-slide-index="1"><h1>Deck-patch content</h1></section>',
      ),
    ).toBe(true);
  });

  it('matches when the slide class is mixed with other classes', () => {
    expect(
      elementPatchBodyLooksLikeDeckPatch(
        '<section class="slide dark" data-slide-index="0">…</section>',
      ),
    ).toBe(true);
  });

  it('does not match a well-formed element-patch body', () => {
    expect(
      elementPatchBodyLooksLikeDeckPatch(
        '<patch target-id="hero" slide-index="1" kind="set-text">New</patch>',
      ),
    ).toBe(false);
  });

  it('does not treat slide-counter chrome as a deck-patch body', () => {
    expect(
      elementPatchBodyLooksLikeDeckPatch(
        '<section class="slide-counter">5 / 10</section>',
      ),
    ).toBe(false);
  });

  it('does not match an empty or whitespace-only body', () => {
    expect(elementPatchBodyLooksLikeDeckPatch('')).toBe(false);
    expect(elementPatchBodyLooksLikeDeckPatch('   \n\t   ')).toBe(false);
    expect(elementPatchBodyLooksLikeDeckPatch(null)).toBe(false);
    expect(elementPatchBodyLooksLikeDeckPatch(undefined)).toBe(false);
  });
});

describe('deckPatchBodyLooksLikeElementPatch', () => {
  it('matches a deck-patch body that actually contains <patch> blocks and no slide sections', () => {
    expect(
      deckPatchBodyLooksLikeElementPatch(
        '<patch target-id="hero" slide-index="1" kind="set-style">{"fontSize":"32px"}</patch>',
      ),
    ).toBe(true);
  });

  it('matches multiple <patch> blocks with mixed casing', () => {
    expect(
      deckPatchBodyLooksLikeElementPatch(
        '<Patch target-id="a" slide-index="0" kind="set-text">x</Patch><patch target-id="b" slide-index="0" kind="set-text">y</patch>',
      ),
    ).toBe(true);
  });

  it('does not match a body that ALSO contains <section class="slide"> — that is a real deck-patch', () => {
    expect(
      deckPatchBodyLooksLikeElementPatch(
        '<section class="slide" data-slide-index="0"><patch>irrelevant</patch></section>',
      ),
    ).toBe(false);
  });

  it('does not match a well-formed deck-patch body', () => {
    expect(
      deckPatchBodyLooksLikeElementPatch(
        '<section class="slide" data-slide-index="1"><h1>Deck</h1></section>',
      ),
    ).toBe(false);
  });

  it('treats chrome-only plus patch as the element-patch salvage case', () => {
    expect(
      deckPatchBodyLooksLikeElementPatch(
        '<section class="slide-counter">5 / 10</section>'
        + '<patch target-id="hero" slide-index="1" kind="set-text">New</patch>',
      ),
    ).toBe(true);
  });

  it('does not match empty, whitespace-only, or non-patch content', () => {
    expect(deckPatchBodyLooksLikeElementPatch('')).toBe(false);
    expect(deckPatchBodyLooksLikeElementPatch('   \n   ')).toBe(false);
    expect(deckPatchBodyLooksLikeElementPatch(null)).toBe(false);
    expect(deckPatchBodyLooksLikeElementPatch(undefined)).toBe(false);
    expect(
      deckPatchBodyLooksLikeElementPatch(
        '<h1>plain content without patch or slide tags</h1>',
      ),
    ).toBe(false);
  });
});

describe('isElementPatchEmptyBody', () => {
  it('recognizes the two empty-body sentinels', () => {
    expect(isElementPatchEmptyBody('empty element-patch body')).toBe(true);
    expect(isElementPatchEmptyBody('no <patch> blocks in element-patch body')).toBe(true);
  });

  it('does not confuse other parse failures as "empty"', () => {
    expect(isElementPatchEmptyBody('element-patch <patch> missing target-id attribute')).toBe(
      false,
    );
    expect(isElementPatchEmptyBody('element-patch uses unsupported kind "foo"')).toBe(false);
    expect(isElementPatchEmptyBody('deck_patch_merge_failed')).toBe(false);
  });
});

describe('isDeckPatchEmptyBody', () => {
  const emptySentinel = 'no <section class="slide"> blocks in deck-patch body';

  it('accepts a truly empty body with the emptiness sentinel', () => {
    expect(isDeckPatchEmptyBody('', emptySentinel)).toBe(true);
    expect(isDeckPatchEmptyBody('   \n\t   ', emptySentinel)).toBe(true);
  });

  it('accepts a body with content that is not <patch> or <section class="slide">', () => {
    expect(isDeckPatchEmptyBody('<h1>just a heading</h1>', emptySentinel)).toBe(true);
  });

  it('rejects a body that contains <patch> blocks — that is the element-patch salvage case, not empty', () => {
    expect(
      isDeckPatchEmptyBody(
        '<patch target-id="hero" slide-index="1" kind="set-text">x</patch>',
        emptySentinel,
      ),
    ).toBe(false);
  });

  it('rejects any reason other than the emptiness sentinel', () => {
    expect(isDeckPatchEmptyBody('', 'deck-patch section missing data-slide-index attribute')).toBe(
      false,
    );
    expect(
      isDeckPatchEmptyBody('', 'deck-patch section uses unsupported data-op'),
    ).toBe(false);
  });
});
