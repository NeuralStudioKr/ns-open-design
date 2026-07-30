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
import {
  slideDiffIsStyleOnly,
  extractSlideByIndex,
  targetTextPreservedInPatchedSlide,
} from '../src/edit-mode/scoped-deck-patch';
import type { ChatCommentAttachment } from '../src/types';

function makeAttachment(overrides: Partial<ChatCommentAttachment> = {}): ChatCommentAttachment {
  return {
    id: 'c1',
    order: 1,
    filePath: 'deck.html',
    elementId: 'path-1-2',
    selector: '[data-od-id="path-1-2"]',
    label: 'p',
    comment: '회사 이름 눈에 잘 띄게 수정',
    currentText: '뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.',
    pagePosition: { x: 0, y: 0, width: 10, height: 10 },
    htmlHint: '<p>뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.</p>',
    selectionKind: 'element',
    slideIndex: 1,
    ...overrides,
  };
}

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

  it('accepts removing line breaks when visible words are unchanged', () => {
    const current = '<section class="slide"><h2>AI를 모두의 기술로<br>만드는 기업</h2></section>';
    const patched = '<section class="slide"><h2>AI를 모두의 기술로 만드는 기업</h2></section>';
    expect(slideDiffIsStyleOnly(current, patched)).toBe(true);
  });
});

describe('slideDiffIsStyleOnly — non-style diffs (safety rail)', () => {
  it('rejects a diff that only added attribute noise on a non-existing element', () => {
    // Model rewrote the slide entirely: new sibling <div class="badge">
    // NEW appears in patched. Structural difference must reject the
    // style-only path (the text-preserved fallback path is the one
    // that would rescue this scenario, not the style-only path).
    const current = [
      '<section class="slide" data-slide-index="0">',
      '<h1 data-od-id="company-name">회사 이름</h1>',
      '</section>',
    ].join('');
    const patched = [
      '<section class="slide" data-slide-index="0">',
      '<h1 data-od-id="company-name">회사 이름</h1>',
      '<span class="badge">NEW</span>',
      '</section>',
    ].join('');
    expect(slideDiffIsStyleOnly(current, patched)).toBe(false);
  });
});

describe('targetTextPreservedInPatchedSlide', () => {
  // This is the second-tier fallback in mergeScopedCommentTargetsFromPatchedDeck:
  // when the model rewrote the slide's structure (added a span wrapper
  // around the target text for emphasis, or dropped data-od-id during
  // a slide restyle) the narrow merge can't locate the target, but if
  // the target's captured text still appears verbatim in the patched
  // slide the response is semantically valid and we accept the
  // slide-level swap so the user's edit actually ships.

  it('accepts a patched slide that still contains the captured target text', () => {
    // Model wrapped 뉴럴스튜디오㈜ in a new gradient span. Structural
    // change (new element inside p), but currentText is preserved.
    const patched = [
      '<section class="slide" data-slide-index="1">',
      '<h2>AI를 <span>모두의 기술</span>로 만드는 기업</h2>',
      '<p style="font-size:26px"><span style="background:linear-gradient(90deg,#2563eb,#6366f1);font-size:34px;font-weight:900">뉴럴스튜디오㈜</span>는 Agentic AI OS 기반의 AI-native 회사입니다.</p>',
      '</section>',
    ].join('');
    expect(targetTextPreservedInPatchedSlide(patched, makeAttachment())).toBe(true);
  });

  it('rejects a patched slide that dropped the target text entirely', () => {
    // Model replaced 뉴럴스튜디오㈜ with an entirely different string.
    // The scoped merge must NOT accept — this is a wholly-different
    // slide dressed up as a comment edit.
    const patched = [
      '<section class="slide" data-slide-index="1">',
      '<h2>완전히 다른 헤드라인이 들어감</h2>',
      '<p>회사 이름이 사라졌다는 사실도 감지되어야 합니다.</p>',
      '</section>',
    ].join('');
    expect(targetTextPreservedInPatchedSlide(patched, makeAttachment())).toBe(false);
  });

  it('accepts when currentText is captured as a shorter fragment (e.g. only span text)', () => {
    // If the user clicked the inner span for 뉴럴스튜디오㈜, the
    // captured currentText is just "뉴럴스튜디오㈜". Any patched
    // slide that keeps that literal text should qualify.
    const patched = [
      '<section class="slide" data-slide-index="1">',
      '<h1>회사 소개</h1>',
      '<p><span style="color:#2563eb">뉴럴스튜디오㈜</span>는 회사입니다.</p>',
      '</section>',
    ].join('');
    expect(
      targetTextPreservedInPatchedSlide(patched, makeAttachment({ currentText: '뉴럴스튜디오㈜' })),
    ).toBe(true);
  });

  it('normalizes whitespace when comparing so multi-line captures still match', () => {
    // Preview iframe captures text via `el.textContent` and normalizes,
    // but disk HTML often preserves original whitespace. The check
    // must tolerate whitespace differences to stay resilient across
    // capture-vs-disk formatting.
    const patched = [
      '<section class="slide">',
      '<p>\n  뉴럴스튜디오㈜는\n  Agentic AI OS 기반의\n  AI-native 회사입니다.\n</p>',
      '</section>',
    ].join('');
    expect(
      targetTextPreservedInPatchedSlide(
        patched,
        makeAttachment({ currentText: '뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.' }),
      ),
    ).toBe(true);
  });

  it('rejects when the attachment has no captured text at all', () => {
    // Free-pin comments have no currentText. Without a captured
    // identity anchor we can't safely accept a slide-level swap.
    expect(
      targetTextPreservedInPatchedSlide(
        '<section class="slide">anything at all</section>',
        makeAttachment({ currentText: '', htmlHint: '' }),
      ),
    ).toBe(false);
  });

  it('accepts when htmlHint carries the identity anchor even if currentText is stripped', () => {
    // Some capture paths land currentText empty (e.g., text-only
    // elements with only inline SVG that textContent normalizes to
    // ''), but htmlHint keeps a snippet that includes the original
    // visible text. The fallback must pick that up so the merge
    // still ships.
    const patched = [
      '<section class="slide">',
      '<h2><span style="color:#ef4444">뉴럴스튜디오㈜</span> 회사입니다.</h2>',
      '</section>',
    ].join('');
    expect(
      targetTextPreservedInPatchedSlide(
        patched,
        makeAttachment({
          currentText: '',
          htmlHint: '<h2>뉴럴스튜디오㈜ 회사입니다.</h2>',
        }),
      ),
    ).toBe(true);
  });

  it('accepts when a pod-member captured text anchors the identity check', () => {
    // Pod selections carry multiple podMembers; each has its own
    // captured text. Any single member surviving in the patched
    // slide is enough to greenlight the swap — the user selected
    // that group as a semantic unit.
    const patched = [
      '<section class="slide">',
      '<div><strong>회사</strong> 소개</div>',
      '<div>다른 요소</div>',
      '</section>',
    ].join('');
    expect(
      targetTextPreservedInPatchedSlide(
        patched,
        makeAttachment({
          currentText: '',
          htmlHint: '',
          selectionKind: 'pod',
          podMembers: [
            {
              elementId: 'm1',
              selector: '[data-od-id="m1"]',
              label: 'strong',
              text: '회사',
              position: { x: 0, y: 0, width: 10, height: 10 },
              htmlHint: '<strong>회사</strong>',
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('accepts 2-char Korean anchor tokens like "회사"', () => {
    // Historically the min-length was 4 which rejected short-but
    // -distinctive Korean identity tokens. 2 chars is enough anchor
    // for CJK — substring collisions on 2-char strings are
    // acceptable given how narrowly we already scoped to the slide.
    const patched = '<section class="slide"><h1 style="color:red">회사 이름</h1></section>';
    expect(
      targetTextPreservedInPatchedSlide(
        patched,
        makeAttachment({ currentText: '회사', htmlHint: '' }),
      ),
    ).toBe(true);
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
