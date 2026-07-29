// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  coerceDeckPatchToAllowedScope,
  inferSlideIndexFromDeckHtml,
  mergeScopedCommentTargetsFromPatchedDeck,
  reconcileCommentAttachmentSlideIndex,
  resolveElementPatchAllowedSlideIndexes,
  resolveScopedCommentSlideCandidates,
} from '../../src/edit-mode/scoped-deck-patch';
import { parseElementPatch } from '../../src/artifacts/element-patch';
import type { ChatCommentAttachment } from '../../src/types';

const CURRENT_HTML = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>인트로</h1></section>
<section class="slide" data-slide-index="1">
  <p data-od-id="path-1-2">뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.</p>
</section>
</body></html>`;

function attachment(slideIndex: number): ChatCommentAttachment {
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
    selectionKind: 'element',
    slideIndex,
  };
}

describe('coerceDeckPatchToAllowedScope', () => {
  it('does not coerce when the model slide already contains the target text', () => {
    const patch = {
      ops: [{ op: 'replace' as const, slideIndex: 1, html: '<section class="slide">patched</section>' }],
    };
    const coerced = coerceDeckPatchToAllowedScope(patch, [0], CURRENT_HTML, [attachment(0)]);
    expect(coerced.ops[0]?.slideIndex).toBe(1);
  });

  it('coerces to the allowed slide when the model slide does not contain the target text', () => {
    const patch = {
      ops: [{ op: 'replace' as const, slideIndex: 2, html: '<section class="slide">patched</section>' }],
    };
    const coerced = coerceDeckPatchToAllowedScope(patch, [0], CURRENT_HTML, [attachment(0)]);
    expect(coerced.ops[0]?.slideIndex).toBe(0);
  });
});

describe('resolveScopedCommentSlideCandidates', () => {
  it('prefers text-verified slides over a stale attachment slideIndex', () => {
    const candidates = resolveScopedCommentSlideCandidates({
      attachment: attachment(0),
      currentHtml: CURRENT_HTML,
      patchedHtml: CURRENT_HTML,
    });
    expect(candidates).toEqual([1]);
  });

  it('includes slides that changed between current and patched decks', () => {
    const patchedHtml = CURRENT_HTML.replace(
      '뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.',
      '<span style="color:red">뉴럴스튜디오㈜</span>는 Agentic AI OS 기반의 AI-native 회사입니다.',
    );
    const candidates = resolveScopedCommentSlideCandidates({
      attachment: {
        ...attachment(1),
        currentText: '',
        htmlHint: '',
        elementId: 'dom:body > section:nth-of-type(2) > p:nth-of-type(1)',
        selector: 'body > section:nth-of-type(2) > p:nth-of-type(1)',
      },
      currentHtml: CURRENT_HTML,
      patchedHtml,
    });
    expect(candidates).toContain(1);
  });
});

describe('reconcileCommentAttachmentSlideIndex', () => {
  it('corrects a stale attachment.slideIndex using target text on the current deck', () => {
    const reconciled = reconcileCommentAttachmentSlideIndex(CURRENT_HTML, attachment(0));
    expect(reconciled.slideIndex).toBe(1);
  });

  it('keeps a correct attachment.slideIndex unchanged', () => {
    const reconciled = reconcileCommentAttachmentSlideIndex(CURRENT_HTML, attachment(1));
    expect(reconciled.slideIndex).toBe(1);
  });
});

describe('inferSlideIndexFromDeckHtml', () => {
  it('returns 0 for single-slide decks', () => {
    const html = '<body><section class="slide"><p>Only</p></section></body>';
    expect(inferSlideIndexFromDeckHtml(html, attachment(0))).toBe(0);
  });
});

describe('resolveElementPatchAllowedSlideIndexes', () => {
  it('accepts the model slide when attachment.slideIndex is stale', () => {
    const parsed = parseElementPatch(`
      <patch target-id="path-1-2" slide-index="1" kind="set-style">{"fontWeight":"900"}</patch>
    `);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const allowed = resolveElementPatchAllowedSlideIndexes({
      currentHtml: CURRENT_HTML,
      patches: parsed.patches,
      allowedSlideIndexes: [0],
      commentAttachments: [attachment(0)],
    });
    expect(allowed).toContain(1);
  });
});

describe('mergeScopedCommentTargetsFromPatchedDeck', () => {
  it('rejects when element ids exist but no slide can be resolved', () => {
    const wipedHtml = CURRENT_HTML.replace(/뉴럴스튜디오㈜/g, '다른회사');
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml: wipedHtml,
      patchedHtml: wipedHtml,
      commentAttachments: [{
        ...attachment(1),
        currentText: '뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.',
        htmlHint: '',
      }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBeTruthy();
    }
  });

  it('merges framework deck comments via selector hint when stale path ids miss on disk', () => {
    const frameworkCurrent = `<!doctype html><html><body>
<div class="deck-shell">
  <div id="deck-stage" class="deck-stage">
    <section class="slide active"><h2>Title</h2></section>
    <section class="slide">
      <p>뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.</p>
    </section>
  </div>
</div>
</body></html>`;
    const patchedSlide = `<section class="slide" data-slide-index="1">
  <p><span style="color:#2563eb;font-weight:900">뉴럴스튜디오㈜</span>는 Agentic AI OS 기반의 AI-native 회사입니다.</p>
</section>`;
    const frameworkPatched = frameworkCurrent.replace(
      /<section class="slide">\s*<p>뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다\.<\/p>\s*<\/section>/,
      patchedSlide,
    );
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml: frameworkCurrent,
      patchedHtml: frameworkPatched,
      commentAttachments: [{
        id: 'c-fw',
        order: 1,
        filePath: 'deck.html',
        elementId: 'path-0-0-1-0',
        selector: 'body > div:nth-of-type(1) > div:nth-of-type(1) > section:nth-of-type(2) > p:nth-of-type(1)',
        label: 'p',
        comment: '회사 이름 눈에 잘 띄게 수정',
        currentText: '뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.',
        pagePosition: { x: 0, y: 0, width: 10, height: 10 },
        htmlHint: '<p>',
        selectionKind: 'element',
        slideIndex: 1,
      }],
      instructionText: '회사 이름 눈에 잘 띄게 수정',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain('font-weight:900');
    expect(result.html).toContain('뉴럴스튜디오㈜');
    expect(result.html).toContain('<h2>Title</h2>');
  });

  it('accepts an anchor-less scoped edit via the last-resort slide-level swap', () => {
    // Bug (2026-07-29): user reported "deck_patch_merge_failed — No
    // matching targets found to merge." The attachment carried a
    // valid slideIndex + elementId but no identity anchor
    // (currentText, htmlHint, and podMembers were all empty), so the
    // narrow merge could not resolve the target in either the
    // current or patched slide, and the text-preserved fallback had
    // no anchor to check with. The last-resort catch-all now applies
    // the patched slide as a slide-level swap when the diff has
    // measurable content — the strict scope apply already restricted
    // the model to the attached slide, so the swap is bounded.
    const currentHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>인트로</h1></section>
<section class="slide" data-slide-index="1">
  <p>어떤 본문 텍스트</p>
</section>
</body></html>`;
    const patchedHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>인트로</h1></section>
<section class="slide" data-slide-index="1">
  <p style="font-weight:700;color:#ef4444">어떤 본문 텍스트</p>
</section>
</body></html>`;
    const anchorLessAttachment: ChatCommentAttachment = {
      id: 'c1',
      order: 1,
      filePath: 'deck.html',
      // Non-empty elementId (needed for scopedCommentElementIds to
      // return a non-empty ids array) that does NOT resolve in either
      // current or patched HTML.
      elementId: 'phantom-id-not-in-deck',
      selector: '[data-od-id="phantom-id-not-in-deck"]',
      label: 'p',
      comment: '회사 이름 눈에 잘 띄게 수정',
      currentText: '',
      htmlHint: '',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml,
      patchedHtml,
      commentAttachments: [anchorLessAttachment],
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    // The last-resort swap must ship the model's slide-level style
    // edit — otherwise the user's request silently drops.
    expect(result.html).toContain('font-weight:700');
    expect(result.html).toContain('color:#ef4444');
    // Non-target slides survive unchanged — the swap is scoped to
    // the attached slideIndex only.
    expect(result.html).toContain('<h1>인트로</h1>');
  });

  it('rejects a "target unchanged" scoped edit instead of swapping the whole slide', () => {
    // Regression guard (2026-07-29): a previous fallback accepted a
    // whole-slide replacement when the selected target resolved but
    // was byte-identical in the model output. That made comment edits
    // mutate sibling elements/pages while the selected element stayed
    // unchanged. Anchored element comments must reject this response
    // so the persist layer can retry under the same scope.
    const currentHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>인트로</h1></section>
<section class="slide" data-slide-index="1">
  <h1 data-od-id="target">회사 소개</h1>
  <p>어떤 본문 텍스트</p>
</section>
</body></html>`;
    const patchedHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>인트로</h1></section>
<section class="slide" data-slide-index="1">
  <h1 data-od-id="target">회사 소개</h1>
  <div class="highlight-wrapper">
    <p>어떤 본문 텍스트</p>
    <span class="badge">NEW</span>
  </div>
</section>
</body></html>`;
    const targetUnchangedAttachment: ChatCommentAttachment = {
      id: 'c1',
      order: 1,
      filePath: 'deck.html',
      // elementId RESOLVES on both docs (data-od-id survives), so
      // narrow merge returns "Selected targets were unchanged." —
      // the target h1 itself was not touched by the model.
      elementId: 'target',
      selector: '[data-od-id="target"]',
      label: 'h1',
      comment: '회사 이름 눈에 잘 띄게 수정',
      // Note: currentText intentionally set to something that will
      // NOT appear verbatim in the patched slide's textContent so
      // targetTextPreservedInPatchedSlide declines. That forces the
      // last-resort branch to be the one that ships the edit.
      currentText: 'THIS_WILL_NOT_APPEAR_ANYWHERE_IN_PATCHED',
      htmlHint: '<h1>',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml,
      patchedHtml,
      commentAttachments: [targetUnchangedAttachment],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('Selected targets were unchanged.');
  });

  it('does not accept an anchor-less swap when the slide diff is empty', () => {
    // Safety: if the model's response is byte-identical to current,
    // there is no visible edit to ship and we shouldn't pretend
    // there was one. This keeps the anchor-less catch-all from
    // silently marking a no-op merge as successful.
    const currentHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>인트로</h1></section>
<section class="slide" data-slide-index="1"><p>Body</p></section>
</body></html>`;
    const anchorLess: ChatCommentAttachment = {
      id: 'c1',
      order: 1,
      filePath: 'deck.html',
      elementId: 'phantom-id',
      selector: '[data-od-id="phantom-id"]',
      label: 'p',
      comment: 'test',
      currentText: '',
      htmlHint: '',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml,
      patchedHtml: currentHtml,
      commentAttachments: [anchorLess],
    });
    expect(result.ok).toBe(false);
  });
});
