// @vitest-environment jsdom
//
// Behavioral coverage for the "style-only slide diff" fallback in
// mergeScopedCommentTargetsFromPatchedDeck.
//
// Failure scenario this fallback exists to unblock:
//   User clicks an h1 with text "회사 이름" and writes
//     "회사 이름 눈에 잘 띄게 수정".
//   Model responds with a `<artifact type="deck-patch">` that adds a
//     slide-level `<style>` block (or a class attribute on an
//     ancestor) to make the h1 stand out. The h1's OWN outerHTML is
//     byte-identical to the current source — the model did not inline
//     the style edit onto the target element.
//
// The narrow element merge sees `changedCount === 0` and rejects with
// "Selected targets were unchanged." Historically that surfaced as a
// `deck_patch_merge_failed` scope-rejected banner even though the
// model's response was legitimate. The fallback here inspects the
// slide diff and accepts a slide-level swap iff the diff is limited
// to style-related surfaces (see `slideDiffIsStyleOnly` docstring).
//
// The stricter guard (rejecting sibling-text / structural changes) is
// preserved — that's what the earlier docs (2026-07-28 comment style
// edit 단일 슬라이드 fallback 회수) put in place for the case where
// the model touches unrelated markup while claiming a scoped edit.

import { describe, expect, it } from 'vitest';
import { slideDiffIsStyleOnly, extractSlideByIndex } from '../src/components/ProjectView';

describe('slideDiffIsStyleOnly', () => {
  it('accepts an added slide-level <style> block as style-only', () => {
    const current = [
      '<section class="slide" data-slide-index="0">',
      '<h1 data-od-id="company-name">회사 이름</h1>',
      '<p>본문 문구</p>',
      '</section>',
    ].join('');
    const patched = [
      '<section class="slide" data-slide-index="0">',
      '<style>[data-od-id="company-name"] { font-size: 48px; font-weight: 800; color: #ef4444; }</style>',
      '<h1 data-od-id="company-name">회사 이름</h1>',
      '<p>본문 문구</p>',
      '</section>',
    ].join('');
    expect(slideDiffIsStyleOnly(current, patched)).toBe(true);
  });

  it('accepts an added class attribute on the section itself as style-only', () => {
    const current = [
      '<section class="slide" data-slide-index="0">',
      '<h1 data-od-id="company-name">회사 이름</h1>',
      '</section>',
    ].join('');
    const patched = [
      '<section class="slide emphasized" data-slide-index="0">',
      '<h1 data-od-id="company-name">회사 이름</h1>',
      '</section>',
    ].join('');
    expect(slideDiffIsStyleOnly(current, patched)).toBe(true);
  });

  it('accepts inline style added on an ancestor of the target', () => {
    const current = [
      '<section class="slide" data-slide-index="0">',
      '<div class="wrapper"><h1 data-od-id="company-name">회사 이름</h1></div>',
      '</section>',
    ].join('');
    const patched = [
      '<section class="slide" data-slide-index="0">',
      '<div class="wrapper" style="background: rgba(239, 68, 68, 0.1); padding: 24px;"><h1 data-od-id="company-name">회사 이름</h1></div>',
      '</section>',
    ].join('');
    expect(slideDiffIsStyleOnly(current, patched)).toBe(true);
  });

  it('rejects a sibling text change even when the target survives verbatim', () => {
    // This is the exact regression the earlier docs pin: model
    // rewrote sibling copy while claiming a scoped edit. The fallback
    // must NOT accept this — the target's outerHTML is unchanged, so
    // the narrow merge already rejected, and the style-only check
    // must return false to keep the reject path active.
    const current = [
      '<section class="slide" data-slide-index="0">',
      '<h1 data-od-id="company-name">회사 이름</h1>',
      '<p>본문 문구</p>',
      '</section>',
    ].join('');
    const patched = [
      '<section class="slide" data-slide-index="0">',
      '<h1 data-od-id="company-name">회사 이름</h1>',
      '<p>완전히 다른 본문 문구가 들어갔음</p>',
      '</section>',
    ].join('');
    expect(slideDiffIsStyleOnly(current, patched)).toBe(false);
  });

  it('rejects a structural change (new element / removed element)', () => {
    const current = [
      '<section class="slide" data-slide-index="0">',
      '<h1 data-od-id="company-name">회사 이름</h1>',
      '</section>',
    ].join('');
    const patched = [
      '<section class="slide" data-slide-index="0">',
      '<h1 data-od-id="company-name">회사 이름</h1>',
      '<div class="badge">NEW</div>',
      '</section>',
    ].join('');
    expect(slideDiffIsStyleOnly(current, patched)).toBe(false);
  });

  it('tolerates whitespace-only differences between the two sides', () => {
    const current = '<section class="slide"><h1>회사</h1></section>';
    const patched = '<section class="slide">\n  <h1>회사</h1>\n</section>';
    expect(slideDiffIsStyleOnly(current, patched)).toBe(true);
  });

  it('drops HTML comments before comparing structure', () => {
    const current = '<section class="slide"><h1>회사</h1></section>';
    const patched = '<section class="slide"><!-- generated by model --><h1>회사</h1></section>';
    expect(slideDiffIsStyleOnly(current, patched)).toBe(true);
  });
});

describe('extractSlideByIndex', () => {
  it('returns the top-level slide outer HTML at the given index', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><h1>슬라이드 1</h1></section>',
      '<section class="slide" data-slide-index="1"><h1>슬라이드 2</h1></section>',
      '<section class="slide" data-slide-index="2"><h1>슬라이드 3</h1></section>',
      '</body></html>',
    ].join('');
    const zero = extractSlideByIndex(html, 0);
    const one = extractSlideByIndex(html, 1);
    expect(zero).toContain('슬라이드 1');
    expect(zero).not.toContain('슬라이드 2');
    expect(one).toContain('슬라이드 2');
    expect(one).not.toContain('슬라이드 3');
  });

  it('returns null when the slide index is out of range', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide"><h1>Only slide</h1></section>',
      '</body></html>',
    ].join('');
    expect(extractSlideByIndex(html, 5)).toBeNull();
  });

  it('ignores nested <section> blocks when counting slides', () => {
    // A slide that itself contains a nested `<section>` (e.g. a card)
    // must not consume the next slide's index. `extractTopLevelSlideSections`
    // owns this depth counting; the helper simply hands the index in.
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide"><section class="inner-card">Card 1</section>Slide 1 body</section>',
      '<section class="slide"><h1>Slide 2</h1></section>',
      '</body></html>',
    ].join('');
    expect(extractSlideByIndex(html, 1)).toContain('Slide 2');
    expect(extractSlideByIndex(html, 1)).not.toContain('Card 1');
  });
});
