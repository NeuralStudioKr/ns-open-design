// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  applyScopedDeckPatchToHtml,
  coerceDeckPatchToAllowedScope,
  inferSlideIndexFromDeckHtml,
  mergeScopedCommentTargetsFromPatchedDeck,
  reconcileCommentAttachmentElementId,
  reconcileCommentAttachmentSlideIndex,
  reconcileCommentScopeForPersist,
  resolveElementPatchAllowedSlideIndexes,
  resolveScopedCommentSlideCandidates,
  scopedCommentElementIds,
  graftVisualMarksIntoDeckHtml,
  repairWipedSlidesForVisualMarks,
  stabilizeVisualMarkDeckHtml,
  hasElementScopedCommentAttachments,
  isDrawnVisualMarkAttachment,
  shouldClientGraftVisualMarkWithoutAi,
  isVisualCommentAttachment,
} from '../../src/edit-mode/scoped-deck-patch';
import {
  extractDeckBodyContent,
  extractTopLevelSlideSections,
} from '../../src/artifacts/deck-patch';
import { parseElementPatch } from '../../src/artifacts/element-patch';
import type { ChatCommentAttachment } from '../../src/types';
import { buildVisualAnnotationAttachment, buildConcreteElementPatchTemplate } from '../../src/comments';
import { sanitizeManualEditFullSource } from '../../src/edit-mode/source-patches';

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

describe('hasElementScopedCommentAttachments', () => {
  it('returns false for visual-only attachments so slide-level edits are not blocked', () => {
    expect(hasElementScopedCommentAttachments([{
      ...attachment(1),
      selectionKind: 'visual',
      elementId: 'visual-mark-1',
      selector: '',
      htmlHint: '',
      screenshotPath: 'uploads/visual-mark-1.png',
      markKind: 'stroke',
    }])).toBe(false);
  });

  it('does not client-graft box marks — they select a region to edit via AI', () => {
    expect(shouldClientGraftVisualMarkWithoutAi({
      ...attachment(1),
      selectionKind: 'visual',
      elementId: 'visual-mark-box-1',
      selector: '',
      htmlHint: '',
      screenshotPath: 'drawing-1.png',
      markKind: 'box',
      comment: '슬라이드 2 이 글씨들 더 크게',
      intent: 'User request from the annotation note: "슬라이드 2 이 글씨들 더 크게". The screenshot has a red selection box...',
    })).toBe(false);
    expect(isDrawnVisualMarkAttachment({
      ...attachment(1),
      selectionKind: 'visual',
      markKind: 'box',
    })).toBe(true);
  });

  it('does not graft box marks into deck html', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="1"><p>Keep this text</p></section>
</body></html>`;
    const visual = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'drawing-1.png',
      markKind: 'box',
      note: '슬라이드 2 이 글씨들 더 크게',
      bounds: { x: 40, y: 50, width: 200, height: 80 },
      slideIndex: 1,
    });
    expect(graftVisualMarksIntoDeckHtml(deck, [visual])).toBeNull();
  });

  it('returns false when selectionKind is missing but screenshotPath marks a visual annotation', () => {
    expect(hasElementScopedCommentAttachments([{
      ...attachment(1),
      selectionKind: undefined,
      elementId: 'visual-mark-lost-kind',
      selector: '',
      htmlHint: '',
      screenshotPath: 'drawing-2026-07-31.png',
      markKind: 'stroke',
    }])).toBe(false);
    expect(isVisualCommentAttachment({
      ...attachment(1),
      selectionKind: undefined,
      elementId: 'visual-mark-lost-kind',
      selector: '',
      htmlHint: '',
    })).toBe(true);
    expect(scopedCommentElementIds({
      ...attachment(1),
      selectionKind: undefined,
      elementId: 'visual-mark-lost-kind',
      selector: '',
      htmlHint: '',
      screenshotPath: 'drawing-2026-07-31.png',
    })).toEqual([]);
  });

  it('returns true when at least one attachment needs a concrete element target', () => {
    expect(hasElementScopedCommentAttachments([
      {
        ...attachment(1),
        selectionKind: 'visual',
        elementId: 'visual-mark-1',
        selector: '',
        htmlHint: '',
        screenshotPath: 'uploads/visual-mark-1.png',
      },
      attachment(1),
    ])).toBe(true);
  });

  it('keeps visual marks with real DOM targets element-scoped', () => {
    const visualWithTarget = {
      ...attachment(1),
      selectionKind: 'visual' as const,
      elementId: 'hero-title',
      selector: '[data-od-id="hero-title"]',
      htmlHint: '<h1 data-od-id="hero-title">Title</h1>',
      screenshotPath: 'uploads/mark.png',
      markKind: 'click' as const,
    };
    expect(isVisualCommentAttachment(visualWithTarget)).toBe(true);
    expect(scopedCommentElementIds(visualWithTarget)).toContain('hero-title');
    expect(hasElementScopedCommentAttachments([visualWithTarget])).toBe(true);
  });
});

describe('reconcileCommentAttachmentElementId', () => {
  it('maps dom: preview selectors to stable data-od-id on deck html', () => {
    const domAttachment: ChatCommentAttachment = {
      ...attachment(1),
      elementId: 'dom:body > section:nth-of-type(2) > p:nth-of-type(1)',
      selector: 'body > section:nth-of-type(2) > p:nth-of-type(1)',
    };
    const reconciled = reconcileCommentAttachmentElementId(CURRENT_HTML, domAttachment);
    expect(reconciled.elementId).toBe('path-1-2');
    expect(reconciled.slideIndex).toBe(1);
  });

  it('maps box annotation pagePosition to overlapping data-od-id on disk', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Intro</h1></section>
<section class="slide" data-slide-index="1" style="position:relative;width:1920px;height:1080px">
  <h1 data-od-id="title-1" style="position:absolute;left:100px;top:80px;width:400px;height:60px">Big Title</h1>
  <p data-od-id="body-1" style="position:absolute;left:100px;top:200px;width:600px;height:120px">Body text here</p>
</section>
</body></html>`;
    const visual = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'drawing-1.png',
      markKind: 'box',
      note: '이 글씨들 더 크게',
      bounds: { x: 90, y: 190, width: 620, height: 140 },
      slideIndex: 1,
    });
    const reconciled = reconcileCommentAttachmentElementId(deck, visual);
    expect(reconciled.elementId).toBe('body-1');
    expect(reconciled.selector).toBe('[data-od-id="body-1"]');
    expect(reconciled.currentText).toContain('Body text');
  });

  it('reconcile scope enables concrete element-patch templates for box edits', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Intro</h1></section>
<section class="slide" data-slide-index="1" style="position:relative;width:1920px;height:1080px">
  <p data-od-id="body-1" style="position:absolute;left:100px;top:200px;width:600px;height:120px">Body text here</p>
</section>
</body></html>`;
    const visual = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'drawing-1.png',
      markKind: 'box',
      note: '이 글씨들 더 크게',
      bounds: { x: 90, y: 190, width: 620, height: 140 },
      slideIndex: 1,
    });
    const scope = reconcileCommentScopeForPersist(deck, [visual]);
    const template = buildConcreteElementPatchTemplate(scope.attachments);
    expect(template).toContain('target-id="body-1"');
    expect(template).toContain('slide-index="1"');
  });
});

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

  it('does not remap HTML that carries another slide\'s data-screen-label', () => {
    const current = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0" data-screen-label="01 Cover"><h1>Cover</h1></section>',
      '<section class="slide" data-slide-index="1" data-screen-label="02 About"><h2>About</h2></section>',
      '</body></html>',
    ].join('');
    const patch = {
      ops: [{
        op: 'replace' as const,
        slideIndex: 1,
        html: '<section class="slide" data-screen-label="02 About"><h2>Hijacked</h2></section>',
      }],
    };
    const coerced = coerceDeckPatchToAllowedScope(
      patch,
      [0],
      current,
      [{
        ...attachment(0),
        elementId: '01 Cover',
        currentText: 'Cover',
        htmlHint: '<h1>Cover</h1>',
        slideIndex: 0,
      }],
    );
    // Keep the model's index so scoped apply rejects instead of pasting About onto Cover.
    expect(coerced.ops[0]?.slideIndex).toBe(1);
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

describe('scopedCommentElementIds', () => {
  it('drops exact page-root targets but keeps deep dom paths', () => {
    expect(
      scopedCommentElementIds({
        ...attachment(0),
        elementId: 'dom:body',
        selector: 'body',
      }),
    ).toEqual([]);

    expect(
      scopedCommentElementIds({
        ...attachment(1),
        elementId: 'dom:body > section:nth-of-type(2) > p:nth-of-type(1)',
        selector: 'body > section:nth-of-type(2) > p:nth-of-type(1)',
      }),
    ).toEqual(['dom:body > section:nth-of-type(2) > p:nth-of-type(1)']);
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

  it('strips script siblings when style-only slide fallback accepts the patched slide', () => {
    const current = `<!doctype html><html><body>
<section class="slide" data-slide-index="0">
  <h1 data-od-id="hero">Hero</h1>
</section>
</body></html>`;
    // Target element unchanged; sibling script would otherwise ride style-only swap.
    const patched = `<!doctype html><html><body>
<section class="slide" data-slide-index="0">
  <h1 data-od-id="hero">Hero</h1>
  <script src="https://evil.example/x.js"></script>
  <p onclick="alert(1)">note</p>
</section>
</body></html>`;
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml: current,
      patchedHtml: patched,
      commentAttachments: [{
        id: 'c-style',
        order: 1,
        filePath: 'deck.html',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'h1',
        comment: '스타일만 조금 손봐줘',
        currentText: 'Hero',
        htmlHint: '<h1 data-od-id="hero">Hero</h1>',
        pagePosition: { x: 0, y: 0, width: 10, height: 10 },
        selectionKind: 'element',
        slideIndex: 0,
      }],
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    // Slide swaps defer full-source scrub to ProjectView terminal sanitize.
    const clean = sanitizeManualEditFullSource(result.html);
    expect(clean).not.toMatch(/<script\b/i);
    expect(clean).not.toContain('evil.example');
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).toContain('data-od-id="hero"');
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

  it('sanitizes script/on* from anchor-less last-resort slide-level swaps', () => {
    const currentHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>인트로</h1></section>
<section class="slide" data-slide-index="1">
  <p>어떤 본문 텍스트</p>
</section>
</body></html>`;
    const patchedHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>인트로</h1></section>
<section class="slide" data-slide-index="1">
  <p style="color:#ef4444">어떤 본문 텍스트</p>
  <img src="x" onerror="alert(1)">
  <script src="https://evil.example/x.js"></script>
</section>
</body></html>`;
    const anchorLessAttachment: ChatCommentAttachment = {
      id: 'c1',
      order: 1,
      filePath: 'deck.html',
      elementId: 'phantom-id-not-in-deck',
      selector: '[data-od-id="phantom-id-not-in-deck"]',
      label: 'p',
      comment: '강조',
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
    expect(result.html).toContain('color:#ef4444');
    const clean = sanitizeManualEditFullSource(result.html);
    expect(clean).not.toMatch(/<script\b/i);
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).not.toContain('evil.example');
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

  it('accepts a screenshot-only visual mark via slide-level swap', () => {
    const currentHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>인트로</h1></section>
<section class="slide" data-slide-index="1">
  <p>본문</p>
</section>
</body></html>`;
    const patchedHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>인트로</h1></section>
<section class="slide" data-slide-index="1">
  <p style="font-weight:700;color:#ef4444">본문</p>
</section>
</body></html>`;
    const visualAttachment = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'ms798rzf-drawing-2026-07-30T08-31-44-563Z.png',
      markKind: 'stroke',
      note: '여기 강조해줘',
      slideIndex: 1,
      bounds: { x: 10, y: 20, width: 100, height: 40 },
    });
    expect(scopedCommentElementIds(visualAttachment)).toEqual([]);
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml,
      patchedHtml,
      commentAttachments: [visualAttachment],
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain('font-weight:700');
    expect(result.html).toContain('<h1>인트로</h1>');
  });

  it('narrows a full-deck rewrite to the scoped slide when other slides also changed', () => {
    const currentHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0">
  <div data-od-id="decor-1" style="width:176px;height:229px;background:#2C1A0E"></div>
  <h1 data-od-id="title-1">아이폰 시리즈 개요 및 발전 동향 보고서</h1>
</section>
<section class="slide" data-slide-index="1"><h2>Slide 2 original</h2></section>
<section class="slide" data-slide-index="2"><h2>Slide 3 original</h2></section>
</body></html>`;
    const patchedHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0">
  <h1 data-od-id="title-1">아이폰 시리즈 개요 및 발전 동향 보고서</h1>
</section>
<section class="slide" data-slide-index="1"><h2>Slide 2 REWRITTEN</h2></section>
<section class="slide" data-slide-index="2"><h2>Slide 3 REWRITTEN</h2></section>
</body></html>`;
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml,
      patchedHtml,
      commentAttachments: [{
        id: 'c1',
        order: 1,
        filePath: 'deck.html',
        elementId: 'decor-1',
        selector: '[data-od-id="decor-1"]',
        label: 'div',
        comment: '왼쪽 상단 요소 삭제',
        currentText: '',
        htmlHint: '<div style="width:176px;height:229px;background:#2C1A0E"></div>',
        pagePosition: { x: 0, y: 0, width: 176, height: 229 },
        selectionKind: 'element',
        slideIndex: 0,
      }],
      instructionText: '왼쪽 상단 요소 삭제',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.narrowed).toBe(true);
    expect(result.html).not.toContain('decor-1');
    expect(result.html).toContain('Slide 2 original');
    expect(result.html).not.toContain('REWRITTEN');
  });

  it('accepts visual-only marks via slide-level swap when no element id exists', () => {
    const currentHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Cover</h1></section>
<section class="slide" data-slide-index="1"><p data-od-id="body-1">원본 본문</p></section>
</body></html>`;
    const patchedHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Cover</h1></section>
<section class="slide" data-slide-index="1"><p data-od-id="body-1">강조된 본문</p></section>
</body></html>`;
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml,
      patchedHtml,
      commentAttachments: [{
        id: 'visual-1',
        order: 1,
        filePath: 'ms798rzf-drawing.png',
        elementId: 'visual-mark-ms798rzf',
        selector: '',
        label: 'Marked screenshot region',
        comment: '이 영역 강조해줘',
        currentText: '',
        htmlHint: '',
        pagePosition: { x: 10, y: 10, width: 100, height: 80 },
        selectionKind: 'visual',
        markKind: 'stroke',
        screenshotPath: 'ms798rzf-drawing.png',
        slideIndex: 1,
      }],
      instructionText: '이 영역 강조해줘',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.narrowed).toBe(true);
    expect(result.html).toContain('강조된 본문');
    expect(result.html).toContain('Cover');
  });

  it('accepts a layout-only br removal via slide-level presentation fallback', () => {
    const currentHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0">
  <h2 data-od-id="title-1">아이폰 시리즈 개요 및<br>발전 동향 보고서</h2>
</section>
</body></html>`;
    const patchedHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0">
  <h2 data-od-id="title-1">아이폰 시리즈 개요 및 발전 동향 보고서</h2>
</section>
</body></html>`;
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml,
      patchedHtml,
      commentAttachments: [{
        id: 'c1',
        order: 1,
        filePath: 'deck.html',
        elementId: 'title-1',
        selector: '[data-od-id="title-1"]',
        label: 'h2',
        comment: '줄바꿈 없이 한줄로 해줘',
        currentText: '아이폰 시리즈 개요 및\n발전 동향 보고서',
        htmlHint: '<h2 data-od-id="title-1">',
        pagePosition: { x: 0, y: 0, width: 176, height: 229 },
        selectionKind: 'element',
        slideIndex: 0,
      }],
      instructionText: '줄바꿈 없이 한줄로 해줘',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.html).not.toContain('<br');
    expect(result.html).toContain('아이폰 시리즈 개요 및 발전 동향 보고서');
  });

  it('grafts heart visual marks into the scoped slide without replacing slide content', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Title slide</h1></section>
<section class="slide" data-slide-index="1"><p>Keep this text</p></section>
</body></html>`;
    const visual = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'annotations/test.png',
      markKind: 'stroke',
      note: '하트 그려줘',
      bounds: { x: 40, y: 50, width: 80, height: 60 },
      slideIndex: 1,
    });
    const grafted = graftVisualMarksIntoDeckHtml(deck, [visual]);
    expect(grafted).toContain('Keep this text');
    expect(grafted).toContain('od-visual-mark-target');
    expect(grafted).toContain('left:40px;top:50px;width:80px;height:60px');
    expect(grafted).toMatch(/<svg[^>]*viewBox="0 0 24 24"/);
  });

  it('ensures the slide root is position:relative for absolute mark positioning', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Title slide</h1></section>
</body></html>`;
    const visual = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'annotations/test.png',
      markKind: 'stroke',
      note: '하트',
      bounds: { x: 40, y: 50, width: 80, height: 60 },
      slideIndex: 0,
    });
    const grafted = graftVisualMarksIntoDeckHtml(deck, [visual]);
    expect(grafted).toContain('position:relative');
    expect(grafted).toContain('od-visual-mark-target');
  });

  it('grafts drawn visual marks even when reconciler bound a real DOM element', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1 data-od-id="title-1">Title</h1></section>
</body></html>`;
    const visual = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'annotations/test.png',
      markKind: 'stroke',
      note: '하트 그려줘',
      bounds: { x: 40, y: 50, width: 80, height: 60 },
      slideIndex: 0,
      target: {
        filePath: 'deck.html',
        elementId: 'title-1',
        selector: '[data-od-id="title-1"]',
        label: 'Title',
        position: { x: 40, y: 50, width: 80, height: 60 },
      },
    });
    const grafted = graftVisualMarksIntoDeckHtml(deck, [visual]);
    expect(grafted).toContain('od-visual-mark-target');
    expect(grafted).toMatch(/<svg[^>]*viewBox="0 0 24 24"/);
  });

  it('inserts a visible fallback marker when no shape keyword is present', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Title slide</h1></section>
<section class="slide" data-slide-index="1"><p>Keep this text</p></section>
</body></html>`;
    const visual = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'annotations/test.png',
      markKind: 'stroke',
      // Deliberately vague note — the client graft used to embed an empty
      // HTML comment div (invisible) for these; now falls back to a dashed
      // marker so the user sees where the mark landed.
      note: '이거 좀 봐줘',
      bounds: { x: 40, y: 50, width: 80, height: 60 },
      slideIndex: 1,
    });
    const grafted = graftVisualMarksIntoDeckHtml(deck, [visual]);
    expect(grafted).toContain('od-visual-mark-target');
    expect(grafted).toMatch(/<svg[^>]*stroke-dasharray/);
  });

  it('repairs model deck-patches that wiped slide content for visual marks', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Title slide</h1></section>
<section class="slide" data-slide-index="1"><p>Keep this text</p><img src="logo.png" alt="logo" /></section>
</body></html>`;
    const visual = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'annotations/test.png',
      markKind: 'stroke',
      note: '여기에 하트 넣어줘',
      bounds: { x: 40, y: 50, width: 80, height: 60 },
      slideIndex: 1,
    });
    const wiped = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Title slide</h1></section>
<section class="slide" data-slide-index="1" style="position:relative">
<div class="od-visual-mark-target" style="position:absolute;left:40px;top:50px;width:80px;height:60px"></div>
</section>
</body></html>`;
    const repaired = repairWipedSlidesForVisualMarks(deck, wiped, [visual]);
    expect(repaired).toContain('Keep this text');
    expect(repaired).toContain('logo.png');
    expect(repaired).toContain('od-visual-mark-target');
    expect(repaired).toMatch(/<svg[^>]*viewBox="0 0 24 24"/);
  });

  it('does not repair wiped slides for box/edit annotations — those are model edits, not graft marks', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="1"><p>Keep this text</p></section>
</body></html>`;
    const visual = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'drawing-1.png',
      markKind: 'box',
      note: '슬라이드 2 이 글씨들 더 크게',
      bounds: { x: 40, y: 50, width: 200, height: 80 },
      slideIndex: 1,
    });
    const wiped = `<!doctype html><html><body>
<section class="slide" data-slide-index="1" style="position:relative">
<div class="od-visual-mark-target" style="position:absolute;left:40px;top:50px;width:200px;height:80px"></div>
</section>
</body></html>`;
    const repaired = repairWipedSlidesForVisualMarks(deck, wiped, [visual]);
    expect(repaired).toBe(wiped);
  });

  it('stabilizeVisualMarkDeckHtml grafts into current deck when slide count collapses', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Slide 1</h1></section>
<section class="slide" data-slide-index="1"><p>Keep this text</p></section>
<section class="slide" data-slide-index="2"><p>Slide 3</p></section>
</body></html>`;
    const visual = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'annotations/test.png',
      markKind: 'stroke',
      note: '하트 추가',
      bounds: { x: 40, y: 50, width: 80, height: 60 },
      slideIndex: 1,
    });
    const collapsed = `<!doctype html><html><body>
<section class="slide" data-slide-index="0" style="position:relative">
<div class="od-visual-mark-target" style="position:absolute;left:40px;top:50px;width:80px;height:60px"></div>
</section>
</body></html>`;
    const stabilized = stabilizeVisualMarkDeckHtml(deck, collapsed, [visual]);
    expect(stabilized).toContain('Slide 1');
    expect(stabilized).toContain('Keep this text');
    expect(stabilized).toContain('Slide 3');
    expect(stabilized).toContain('od-visual-mark-target');
    // Shared sections path must match cold materialize (finalize/applyScoped).
    const currentSlides = extractTopLevelSlideSections(extractDeckBodyContent(deck));
    const mergedSlides = extractTopLevelSlideSections(extractDeckBodyContent(collapsed));
    const shared = stabilizeVisualMarkDeckHtml(deck, collapsed, [visual], {
      currentSlides,
      mergedSlides,
    });
    expect(shared).toBe(stabilized);
  });

  it('folds full-source sanitize into deck-patch merges (ProjectView can skip terminal scrub)', () => {
    const currentHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Old</h1></section>
</body></html>`;
    const result = applyScopedDeckPatchToHtml({
      currentHtml,
      patch: {
        ops: [{
          op: 'replace',
          slideIndex: 0,
          html: [
            '<section class="slide" data-slide-index="0">',
            '<h1>New</h1>',
            '<img src="x" onerror="alert(1)">',
            '<script>alert(2)</script>',
            '</section>',
          ].join(''),
        }],
      },
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.sanitized).toBe(true);
    expect(result.html).toContain('New');
    expect(result.html).not.toMatch(/onerror/i);
    expect(result.html).not.toMatch(/<script\b/i);
  });

  it('sanitizes XSS from model visual-mark HTML before wipe repair graft', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Title slide</h1></section>
<section class="slide" data-slide-index="1"><p>Keep this text</p></section>
</body></html>`;
    const visual = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'annotations/test.png',
      markKind: 'stroke',
      note: 'mark',
      bounds: { x: 40, y: 50, width: 80, height: 60 },
      slideIndex: 1,
    });
    const wiped = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Title slide</h1></section>
<section class="slide" data-slide-index="1" style="position:relative">
<div class="od-visual-mark-target" style="position:absolute;left:40px;top:50px;width:80px;height:60px">
<svg onload="alert(1)" viewBox="0 0 24 24"></svg>
<img src="x" onerror="alert(2)">
</div>
</section>
</body></html>`;
    const repaired = repairWipedSlidesForVisualMarks(deck, wiped, [visual]);
    expect(repaired).toContain('Keep this text');
    expect(repaired).toContain('od-visual-mark-target');
    expect(repaired).not.toMatch(/onload/i);
    expect(repaired).not.toMatch(/onerror/i);
  });

  it('keeps nested mark children past the first </div> (Document extract, not shallow regex)', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Title slide</h1></section>
<section class="slide" data-slide-index="1"><p>Keep this text</p></section>
</body></html>`;
    const visual = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'annotations/test.png',
      markKind: 'stroke',
      note: 'nested mark',
      bounds: { x: 40, y: 50, width: 80, height: 60 },
      slideIndex: 1,
    });
    // Inner </div> would truncate a shallow regex before the svg lands.
    const wiped = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Title slide</h1></section>
<section class="slide" data-slide-index="1" style="position:relative">
<div class="od-visual-mark-target" style="position:absolute;left:40px;top:50px;width:80px;height:60px">
<div class="mark-inner">pin</div>
<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>
</div>
</section>
</body></html>`;
    const repaired = repairWipedSlidesForVisualMarks(deck, wiped, [visual]);
    expect(repaired).toContain('Keep this text');
    expect(repaired).toContain('od-visual-mark-target');
    expect(repaired).toContain('mark-inner');
    expect(repaired).toMatch(/<svg[^>]*viewBox="0 0 24 24"/);
  });

  it('skips full-source sanitize when graft is called with sanitize:false', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Title slide</h1></section>
<section class="slide" data-slide-index="1"><p>Keep this text</p></section>
</body></html>`;
    const visual = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'annotations/test.png',
      markKind: 'stroke',
      note: '하트 그려줘',
      bounds: { x: 40, y: 50, width: 80, height: 60 },
      slideIndex: 1,
    });
    const raw = graftVisualMarksIntoDeckHtml(deck, [visual], { sanitize: false });
    const scrubbed = graftVisualMarksIntoDeckHtml(deck, [visual]);
    expect(raw).toContain('od-visual-mark-target');
    expect(scrubbed).toContain('od-visual-mark-target');
    // Default path still runs full-source scrub; unsanitized path is for
    // callers that own terminal sanitize (stabilize → applyScoped / salvage).
    expect(sanitizeManualEditFullSource(raw ?? '')).toContain('Keep this text');
    expect(scrubbed).toContain('Keep this text');
  });

  it('reconcileCommentScopeForPersist returns attachments and slide indexes together', () => {
    const scope = reconcileCommentScopeForPersist(CURRENT_HTML, [attachment(0)]);
    expect(scope.attachments[0]?.slideIndex).toBe(1);
    expect(scope.allowedSlideIndexes).toContain(1);
  });

  it('reconcileCommentScopeForPersist shares one section pass across attachments', () => {
    const scope = reconcileCommentScopeForPersist(CURRENT_HTML, [
      attachment(0),
      { ...attachment(1), currentText: 'Keep me', htmlHint: '' },
    ]);
    expect(scope.attachments).toHaveLength(2);
    expect(scope.allowedSlideIndexes?.length).toBeGreaterThan(0);
    expect(scope.attachments[0]?.slideIndex).toBe(1);
  });

  it('merges id-bearing attachment with stale slideIndex across candidates', () => {
    const patchedHtml = CURRENT_HTML.replace(
      '뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.',
      '<strong>뉴럴스튜디오㈜</strong>는 Agentic AI OS 기반의 AI-native 회사입니다.',
    );
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml: CURRENT_HTML,
      patchedHtml,
      commentAttachments: [attachment(0)],
      instructionText: '회사 이름 눈에 잘 띄게 수정',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain('<strong>뉴럴스튜디오㈜</strong>');
    expect(result.narrowed).toBe(true);
  });
});
