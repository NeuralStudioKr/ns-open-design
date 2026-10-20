// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  applyScopedDeckPatchToHtml,
  coerceDeckPatchToAllowedScope,
  inferSlideIndexFromDeckHtml,
  mergeCommentEditIncomingIntoPrior,
  mergeScopedCommentTargetsFromPatchedDeck,
  alignShortCommentIncomingToPriorDeck,
  resolveCommentEditTargetSlideIndexes,
  reconcileCommentAttachmentElementId,
  reconcileCommentAttachmentSlideIndex,
  reconcileCommentScopeForPersist,
  resolveElementPatchAllowedSlideIndexes,
  resolveScopedCommentSlideCandidates,
  scopedCommentElementIds,
  graftVisualMarksIntoDeckHtml,
  graftLocalCommentStyleOntoPrior,
  canGraftLocalCommentStyleWithoutModel,
  shouldSkipModelForLocalCommentStyle,
  tryLocalCommentStyleGraftInsteadOfModel,
  commentAttachmentHasElementTarget,
  isBackgroundColorCommentInstruction,
  isNamedTextColorCommentInstruction,
  isTextOnlyNamedColorInstruction,
  parseCommentPageSlideIndex,
  shouldSurfaceEmptyApiResponseChatError,
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
  it('recovers a deck-patch slide target from comment attachments when data-slide-index is omitted', () => {
    const currentHtml = `<!doctype html><html><body>
<section class="slide slide-1" data-slide-index="0"><h1>인트로</h1></section>
<section class="slide slide-2" data-slide-index="1">
  <p data-od-id="path-1-2">뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.</p>
</section>
<section class="slide slide-3" data-slide-index="2"><h2>마무리</h2></section>
</body></html>`;
    const result = applyScopedDeckPatchToHtml({
      currentHtml,
      patchBody: `<section class="slide slide-2" style="width:1920px;height:1080px">
  <p data-od-id="path-1-2">뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.</p>
  <strong data-od-id="path-1-2-emphasis">회사 이름을 더 눈에 띄게 강조</strong>
</section>`,
      commentAttachments: [attachment(1)],
      instructionText: '회사 이름 눈에 잘 띄게 수정',
    });
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain('회사 이름을 더 눈에 띄게 강조');
    expect(result.html).toContain('<h1>인트로</h1>');
    expect(result.html).toContain('<h2>마무리</h2>');
    expect(result.html).toContain('data-slide-index="1"');
  });

  // 루프530 — Disk deck lost slide-N classes; infer index from patch class alone.
  it('recovers omitted data-slide-index from slide-N class when current deck classes were stripped', () => {
    const currentHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>인트로</h1></section>
<section class="slide" data-slide-index="1">
  <p data-od-id="path-1-2">뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.</p>
</section>
<section class="slide" data-slide-index="2"><h2>마무리</h2></section>
</body></html>`;
    const result = applyScopedDeckPatchToHtml({
      currentHtml,
      patchBody: `<section class="slide slide-2" style="width:1920px;height:1080px;box-sizing:border-box">
  <p data-od-id="path-1-2"><strong>뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.</strong></p>
</section>`,
      commentAttachments: [attachment(1)],
      instructionText: '회사 이름 눈에 잘 띄게 수정',
    });
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain('<strong>뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.</strong>');
    expect(result.html).toContain('<h1>인트로</h1>');
  });

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

describe('1007-N01 U comment short incoming merge', () => {
  function eightSlideDeck(): string {
    return [
      '<!doctype html><html lang="ko"><head><style>:root{--paper:#ffffff}</style></head><body>',
      ...Array.from({ length: 8 }, (_, i) =>
        `<section class="slide" data-slide-index="${i}"><h2>슬라이드 ${i + 1}</h2><p>본문입니다.</p></section>`,
      ),
      '</body></html>',
    ].join('');
  }

  const bgComment = {
    id: 'c-bg',
    order: 1,
    filePath: 'deck.html',
    elementId: 'title-2',
    selector: '[data-od-id="title-2"]',
    label: 'h2',
    comment: '배경색을 파란색으로 바꿔줘',
    currentText: '슬라이드 3',
    htmlHint: '<h2>슬라이드 3</h2>',
    pagePosition: { x: 0, y: 0, width: 10, height: 10 },
    selectionKind: 'element' as const,
    slideIndex: 2,
  };

  it('8-slide prior + 1-slide blue incoming applies color on the pinned slide and keeps count', () => {
    const incoming =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide" style="background:#2563eb">'
      + '<h2>완전히 다른 제목</h2><p>날조된 본문</p>'
      + '</section></body></html>';
    const result = mergeCommentEditIncomingIntoPrior({
      priorHtml: eightSlideDeck(),
      incomingHtml: incoming,
      commentAttachments: [bgComment],
      instructionText: '배경색을 파란색으로 바꿔줘',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.merged).toBe(true);
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(slides[2]?.outerHtml).toMatch(/background(?:-color)?:\s*#2563eb/i);
    expect(slides[2]?.outerHtml).toContain('슬라이드 3');
    expect(slides[2]?.outerHtml).not.toContain('완전히 다른 제목');
    expect(slides[0]?.outerHtml).toContain('슬라이드 1');
    expect(slides[7]?.outerHtml).toContain('슬라이드 8');
    expect(slides[0]?.outerHtml).not.toMatch(/background(?:-color)?:\s*#2563eb/i);
    for (const index of [0, 1, 3, 4, 5, 6, 7]) {
      expect(slides[index]?.outerHtml, `slide ${index} must stay unpainted`).not.toMatch(
        /background(?:-color)?:\s*#2563eb/i,
      );
    }
  });

  it('1-slide incoming with data-slide-index=0 still paints only the pinned slide', () => {
    const incoming =
      '<!doctype html><html lang="ko"><head><style>:root{--paper:#2563eb;--bg:#1d4ed8}</style></head><body>'
      + '<section class="slide" data-slide-index="0" style="background:#2563eb">'
      + '<h2>완전히 다른 제목</h2><p>날조된 본문</p>'
      + '</section></body></html>';
    const result = mergeCommentEditIncomingIntoPrior({
      priorHtml: eightSlideDeck(),
      incomingHtml: incoming,
      commentAttachments: [bgComment],
      instructionText: '배경색을 파란색으로 바꿔줘',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(resolveCommentEditTargetSlideIndexes({
      priorSlideCount: 8,
      incomingSlides: extractTopLevelSlideSections(extractDeckBodyContent(incoming)),
      commentAttachments: [bgComment],
      priorHtml: eightSlideDeck(),
    })).toEqual([2]);
    expect(slides[2]?.outerHtml).toMatch(/background(?:-color)?:\s*#2563eb/i);
    expect(slides[2]?.outerHtml).toContain('슬라이드 3');
    expect(slides[0]?.outerHtml).toContain('슬라이드 1');
    expect(slides[0]?.outerHtml).not.toMatch(/background(?:-color)?:\s*#2563eb/i);
    expect(slides[0]?.outerHtml).not.toMatch(/--paper:\s*#2563eb/i);
    for (const index of [0, 1, 3, 4, 5, 6, 7]) {
      expect(slides[index]?.outerHtml, `slide ${index} must stay unpainted`).not.toMatch(
        /background(?:-color)?:\s*#2563eb/i,
      );
    }
  });

  it('refuses to merge a short incoming without comment attachments', () => {
    const incoming =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide" style="background:#2563eb"><h2>다른 제목</h2></section>'
      + '</body></html>';
    const result = mergeCommentEditIncomingIntoPrior({
      priorHtml: eightSlideDeck(),
      incomingHtml: incoming,
      commentAttachments: [],
      instructionText: '전체 다시 만들어줘',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not a comment-scoped edit');
  });

  it('background comment without extractable incoming color grafts from the instruction', () => {
    const incoming =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h2>완전히 다른 제목</h2><p>날조된 본문</p></section>'
      + '</body></html>';
    const result = mergeCommentEditIncomingIntoPrior({
      priorHtml: eightSlideDeck(),
      incomingHtml: incoming,
      commentAttachments: [bgComment],
      instructionText: '배경색을 파란색으로 바꿔줘',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(slides[2]?.outerHtml).toMatch(/background(?:-color)?:\s*#2563eb/i);
    expect(slides[2]?.outerHtml).toContain('슬라이드 3');
    expect(slides[2]?.outerHtml).not.toContain('완전히 다른 제목');
  });

  it('aligns a 1-slide incoming onto the pinned index for scoped merge', () => {
    const incoming =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide" style="background-color:blue">'
      + '<h2>슬라이드 3</h2><p>본문입니다.</p>'
      + '</section></body></html>';
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml: eightSlideDeck(),
      patchedHtml: incoming,
      commentAttachments: [bgComment],
      instructionText: '배경색을 파란색으로 바꿔줘',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(result.narrowed).toBe(true);
  });
});

describe('1007-N01 X comment local style graft without model HTML', () => {
  function eightSlideDeck(): string {
    return [
      '<!doctype html><html lang="ko"><head><style>:root{--paper:#ffffff}</style></head><body>',
      ...Array.from({ length: 8 }, (_, i) =>
        `<section class="slide" data-slide-index="${i}">`
        + `<p class="kicker" style="font-size:12px">KICKER ${i + 1}</p>`
        + `<h2 style="font-size:32px">슬라이드 ${i + 1}</h2>`
        + `<p style="font-size:16px">본문입니다.</p>`
        + '</section>',
      ),
      '</body></html>',
    ].join('');
  }

  const fontComment: ChatCommentAttachment = {
    id: 'c-font',
    order: 1,
    filePath: 'deck.html',
    elementId: 'title-2',
    selector: '[data-od-id="title-2"]',
    label: 'h2',
    comment: '폰트를 두배 키우자',
    currentText: '슬라이드 3',
    htmlHint: '<h2>슬라이드 3</h2>',
    pagePosition: { x: 0, y: 0, width: 10, height: 10 },
    selectionKind: 'element',
    slideIndex: 2,
  };

  it('empty MiniMax + 폰트를 두배 키우자 doubles pinned title/body and keeps 8 slides', () => {
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: eightSlideDeck(),
      commentAttachments: [fontComment],
      instructionText: '폰트를 두배 키우자',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('font-scale');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(slides[2]?.outerHtml).toMatch(/font-size:\s*64px/i);
    expect(slides[2]?.outerHtml).toMatch(/font-size:\s*32px/i);
    expect(slides[2]?.outerHtml).toContain('슬라이드 3');
    expect(slides[2]?.outerHtml).toContain('본문입니다.');
    expect(slides[2]?.outerHtml).toMatch(/font-size:\s*12px/i);
    expect(slides[0]?.outerHtml).toMatch(/font-size:\s*32px/i);
    expect(slides[0]?.outerHtml).not.toMatch(/font-size:\s*64px/i);
    for (const index of [0, 1, 3, 4, 5, 6, 7]) {
      expect(slides[index]?.outerHtml, `slide ${index} must stay unscaled`).not.toMatch(
        /font-size:\s*64px/i,
      );
    }
    expect(shouldSurfaceEmptyApiResponseChatError({
      commentScoped: true,
      localStyleGraftSucceeded: true,
    })).toBe(false);
  });

  it('empty incoming merge still grafts font double onto the pinned slide', () => {
    const result = mergeCommentEditIncomingIntoPrior({
      priorHtml: eightSlideDeck(),
      incomingHtml: '',
      commentAttachments: [fontComment],
      instructionText: '폰트를 두배 키우자',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.merged).toBe(true);
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(slides[2]?.outerHtml).toMatch(/font-size:\s*64px/i);
    expect(slides[2]?.outerHtml).toContain('슬라이드 3');
  });

  it('empty incoming background comment grafts blue from the instruction', () => {
    const bgComment: ChatCommentAttachment = {
      ...fontComment,
      id: 'c-bg-empty',
      comment: '배경색을 파란색으로 바꿔줘',
    };
    const result = mergeCommentEditIncomingIntoPrior({
      priorHtml: eightSlideDeck(),
      incomingHtml: '',
      commentAttachments: [bgComment],
      instructionText: '배경색을 파란색으로 바꿔줘',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(slides[2]?.outerHtml).toMatch(/background(?:-color)?:\s*#2563eb/i);
    expect(slides[2]?.outerHtml).toContain('슬라이드 3');
    expect(slides[0]?.outerHtml).not.toMatch(/background(?:-color)?:\s*#2563eb/i);
  });

  it('adds 2em when the pinned title/body have no explicit font-size', () => {
    const prior = [
      '<!doctype html><html lang="ko"><body>',
      ...Array.from({ length: 8 }, (_, i) =>
        `<section class="slide" data-slide-index="${i}"><h2>슬라이드 ${i + 1}</h2><p>본문입니다.</p></section>`,
      ),
      '</body></html>',
    ].join('');
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: prior,
      commentAttachments: [fontComment],
      instructionText: '폰트를 두배 키우자',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(slides[2]?.outerHtml).toMatch(/font-size:\s*2em/i);
    expect(slides[0]?.outerHtml).not.toMatch(/font-size:\s*2em/i);
  });

  it('vague comments are not local grafts; empty_response can still error', () => {
    expect(canGraftLocalCommentStyleWithoutModel('이 슬라이드를 더 멋지게')).toBe(false);
    expect(canGraftLocalCommentStyleWithoutModel('폰트 더 크게하자')).toBe(false);
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: eightSlideDeck(),
      commentAttachments: [{ ...fontComment, comment: '이 슬라이드를 더 멋지게' }],
      instructionText: '이 슬라이드를 더 멋지게',
    });
    expect(result.ok).toBe(false);
    expect(shouldSurfaceEmptyApiResponseChatError({
      commentScoped: true,
      localStyleGraftSucceeded: false,
    })).toBe(true);
    expect(shouldSurfaceEmptyApiResponseChatError({
      commentScoped: false,
      localStyleGraftSucceeded: false,
    })).toBe(true);
  });

  it('retry of the same font×2 comment does not double twice', () => {
    const first = graftLocalCommentStyleOntoPrior({
      priorHtml: eightSlideDeck(),
      commentAttachments: [fontComment],
      instructionText: '폰트를 두배 키우자',
    });
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (!first.ok) return;
    const second = graftLocalCommentStyleOntoPrior({
      priorHtml: first.html,
      commentAttachments: [fontComment],
      instructionText: '폰트를 두배 키우자',
    });
    expect(second.ok, JSON.stringify(second)).toBe(true);
    if (!second.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(second.html));
    expect(slides).toHaveLength(8);
    expect(slides[2]?.outerHtml).toMatch(/font-size:\s*64px/i);
    expect(slides[2]?.outerHtml).not.toMatch(/font-size:\s*128px/i);
    expect((slides[2]?.outerHtml.match(/font-size:\s*64px/gi) ?? []).length).toBe(1);
    expect(shouldSurfaceEmptyApiResponseChatError({
      commentScoped: true,
      localStyleGraftSucceeded: true,
    })).toBe(false);
  });

  it('kicker-only pinned slide doubles the kicker', () => {
    const prior = [
      '<!doctype html><html lang="ko"><body>',
      ...Array.from({ length: 8 }, (_, i) =>
        `<section class="slide" data-slide-index="${i}">`
        + `<p class="kicker" style="font-size:12px">KICKER ${i + 1}</p>`
        + '</section>',
      ),
      '</body></html>',
    ].join('');
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: prior,
      commentAttachments: [fontComment],
      instructionText: '폰트를 두배 키우자',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides[2]?.outerHtml).toMatch(/font-size:\s*24px/i);
    expect(slides[2]?.outerHtml).not.toMatch(/font-size:\s*12px/i);
    expect(slides[0]?.outerHtml).toMatch(/font-size:\s*12px/i);
    expect(slides[0]?.outerHtml).not.toMatch(/font-size:\s*24px/i);
  });

  it('explicit 1em title becomes 2em on the pinned slide only', () => {
    const prior = [
      '<!doctype html><html lang="ko"><body>',
      ...Array.from({ length: 8 }, (_, i) =>
        `<section class="slide" data-slide-index="${i}">`
        + `<h2 style="font-size:1em">슬라이드 ${i + 1}</h2>`
        + `<p style="font-size:1em">본문입니다.</p>`
        + '</section>',
      ),
      '</body></html>',
    ].join('');
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: prior,
      commentAttachments: [fontComment],
      instructionText: '폰트를 두배 키우자',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides[2]?.outerHtml).toMatch(/font-size:\s*2em/i);
    expect(slides[2]?.outerHtml).not.toMatch(/font-size:\s*1em/i);
    expect(slides[0]?.outerHtml).toMatch(/font-size:\s*1em/i);
    expect(slides[0]?.outerHtml).not.toMatch(/font-size:\s*2em/i);
  });
});

describe('1007-N01 Y comment named bottom-most Teamver chip fill', () => {
  const COMMENT = '맨 아래에 있는 Teamver를 빨간색으로';
  const PAGE2_ELEMENT = '2페이지 맨 아래 요소';
  const TEXT_ONLY = '맨 아래 Teamver 글자만 빨간색으로';

  function pitchDeck(): string {
    return [
      '<!doctype html><html lang="ko"><head><style>:root{--paper:#f4efe4}</style></head><body>',
      '<section class="slide" data-slide-index="0" style="--paper:#f4efe4">',
      '<h2>Teamver</h2><p>피치 덱</p></section>',
      '<section class="slide" data-slide-index="1" style="--paper:#f4efe4">',
      '<h2>문제</h2>',
      '<div class="card">툴 1</div><div class="card">툴 2</div>',
      '<div class="card">툴 3</div><div class="card">툴 4</div>',
      '<p>Teamver 워크스페이스에서 초안을 고친다</p>',
      '<div style="position:relative;display:flex;align-items:center;gap:24px">',
      '<div>→</div>',
      '<div style="background:#99E885;font-size:32px;font-weight:800">Teamver</div>',
      '</div>',
      '</section>',
      '<section class="slide" data-slide-index="2" style="--paper:#f4efe4">',
      '<h2>슬라이드 3</h2>',
      '<p>Teamver 워크스페이스</p>',
      '</section>',
      ...Array.from({ length: 4 }, (_, i) =>
        `<section class="slide" data-slide-index="${i + 3}" style="--paper:#f4efe4">`
        + `<h2>슬라이드 ${i + 4}</h2>`
        + `<p>본문에 Teamver 가 들어 있다</p>`
        + '</section>',
      ),
      '<section class="slide" data-slide-index="7" style="--paper:#f4efe4">',
      '<h2>Closing</h2>',
      '<p>Teamver와 함께 다음을 연다</p>',
      '<span style="margin-left:auto">© teamver</span>',
      '</section>',
      '</body></html>',
    ].join('');
  }

  function commentOn(
    slideIndex: number,
    comment = COMMENT,
  ): ChatCommentAttachment {
    return {
      id: `c-teamver-${slideIndex}`,
      order: 1,
      filePath: 'deck.html',
      elementId: `chip-${slideIndex}`,
      selector: 'div',
      label: 'div',
      comment,
      currentText: slideIndex === 7 ? '© teamver' : 'Teamver',
      htmlHint: slideIndex === 7
        ? '<span style="margin-left:auto">© teamver</span>'
        : '<div style="background:#99E885">Teamver</div>',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex,
    };
  }

  function commentWithoutPin(comment: string): ChatCommentAttachment {
    return {
      id: 'c-teamver-nopin',
      order: 1,
      filePath: 'deck.html',
      elementId: 'chip-missing',
      selector: 'div',
      label: 'div',
      comment,
      currentText: 'Teamver',
      htmlHint: '<div style="background:#99E885">Teamver</div>',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
    } as ChatCommentAttachment;
  }

  function chipHtml(slideHtml: string): string | null {
    return slideHtml.match(/<div[^>]*>\s*Teamver\s*<\/div>/i)?.[0] ?? null;
  }

  function paragraphHtml(slideHtml: string): string | null {
    return slideHtml.match(/<p[^>]*>\s*Teamver 워크스페이스[^<]*<\/p>/i)?.[0] ?? null;
  }

  function footerHtml(slideHtml: string): string | null {
    return slideHtml.match(/<span[^>]*>\s*© teamver\s*<\/span>/i)?.[0] ?? null;
  }

  function arrowHtml(slideHtml: string): string | null {
    return slideHtml.match(/<div[^>]*>\s*→\s*<\/div>/)?.[0] ?? null;
  }

  function expectChipFillRed(slideHtml: string): void {
    const chip = chipHtml(slideHtml);
    expect(chip).toMatch(/background(?:-color)?:\s*#dc2626/i);
    expect(chip).not.toMatch(/background(?:-color)?:\s*#99E885/i);
    expect(chip).toContain('Teamver');
    expect(chip).not.toMatch(/(?<!background-)color:\s*#dc2626/i);
  }

  function expectOtherSlidesUnpainted(slides: ReturnType<typeof extractTopLevelSlideSections>): void {
    expect(slides[2]?.outerHtml).toContain('Teamver 워크스페이스');
    expect(slides[2]?.outerHtml).not.toMatch(/#dc2626/i);
    expect(footerHtml(slides[7]?.outerHtml ?? '')).not.toMatch(/#dc2626/i);
    expect(slides[7]?.outerHtml).toContain('© teamver');
    for (const index of [0, 2, 3, 4, 5, 6, 7]) {
      expect(slides[index]?.outerHtml, `slide ${index} must stay unpainted`).not.toMatch(
        /#dc2626/i,
      );
    }
  }

  it('classifies 빨간색/요소 as named chip path, not slide background', () => {
    expect(isNamedTextColorCommentInstruction(COMMENT)).toBe(true);
    expect(isBackgroundColorCommentInstruction(COMMENT)).toBe(false);
    expect(canGraftLocalCommentStyleWithoutModel(COMMENT)).toBe(true);
    expect(isNamedTextColorCommentInstruction(PAGE2_ELEMENT)).toBe(true);
    expect(isBackgroundColorCommentInstruction(PAGE2_ELEMENT)).toBe(false);
    expect(canGraftLocalCommentStyleWithoutModel(PAGE2_ELEMENT)).toBe(true);
    expect(isTextOnlyNamedColorInstruction(TEXT_ONLY)).toBe(true);
    expect(isNamedTextColorCommentInstruction(TEXT_ONLY)).toBe(true);
    expect(parseCommentPageSlideIndex(PAGE2_ELEMENT)).toBe(1);
    expect(isNamedTextColorCommentInstruction('왼쪽 상단 요소 삭제')).toBe(false);
    expect(canGraftLocalCommentStyleWithoutModel('왼쪽 상단 요소 삭제')).toBe(false);
    expect(isNamedTextColorCommentInstruction('이 요소를 가운데로')).toBe(false);
    expect(isNamedTextColorCommentInstruction(`${COMMENT} 바꿔줘`)).toBe(true);
    expect(isBackgroundColorCommentInstruction(`${COMMENT} 바꿔줘`)).toBe(false);
    expect(canGraftLocalCommentStyleWithoutModel('배경색을 빨간색으로')).toBe(true);
    expect(isNamedTextColorCommentInstruction('배경색을 빨간색으로')).toBe(false);
    expect(isBackgroundColorCommentInstruction('배경색을 빨간색으로')).toBe(true);
    expect(canGraftLocalCommentStyleWithoutModel('폰트를 두배 키우자')).toBe(true);
  });

  it('slide 2 comment paints the bottom Teamver chip background, not the word color', () => {
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: pitchDeck(),
      commentAttachments: [commentOn(1)],
      instructionText: COMMENT,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('chip-fill');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expectChipFillRed(slides[1]?.outerHtml ?? '');
    expect(arrowHtml(slides[1]?.outerHtml ?? '')).toBe('<div>→</div>');
    expect(paragraphHtml(slides[1]?.outerHtml ?? '')).not.toMatch(/#dc2626/i);
    expect(slides[1]?.outerHtml).toContain('Teamver 워크스페이스에서 초안을 고친다');
    expect(slides[1]?.openTag).not.toMatch(/background(?:-color)?:\s*#dc2626/i);
    expect(slides[1]?.outerHtml).not.toMatch(/--paper:\s*#dc2626/i);
    expectOtherSlidesUnpainted(slides);
    expect(shouldSurfaceEmptyApiResponseChatError({
      commentScoped: true,
      localStyleGraftSucceeded: true,
    })).toBe(false);
  });

  it('2페이지 맨 아래 요소 pins slide 2 when attachments omit slideIndex', () => {
    expect(resolveCommentEditTargetSlideIndexes({
      priorSlideCount: 8,
      incomingSlides: [],
      commentAttachments: [commentWithoutPin(PAGE2_ELEMENT)],
      priorHtml: pitchDeck(),
      instructionText: PAGE2_ELEMENT,
    })).toEqual([1]);
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: pitchDeck(),
      commentAttachments: [commentWithoutPin(PAGE2_ELEMENT)],
      instructionText: PAGE2_ELEMENT,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('chip-fill');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expectChipFillRed(slides[1]?.outerHtml ?? '');
    expect(arrowHtml(slides[1]?.outerHtml ?? '')).toBe('<div>→</div>');
    expectOtherSlidesUnpainted(slides);
  });

  it('글자만 keeps the green chip fill and colors only the Teamver text', () => {
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: pitchDeck(),
      commentAttachments: [commentOn(1, TEXT_ONLY)],
      instructionText: TEXT_ONLY,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('text-color');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    const chip = chipHtml(slides[1]?.outerHtml ?? '');
    expect(chip).toMatch(/color:\s*#dc2626/i);
    expect(chip).toMatch(/background:\s*#99E885/i);
    expect(chip).toContain('Teamver');
    expect(arrowHtml(slides[1]?.outerHtml ?? '')).toBe('<div>→</div>');
    expectOtherSlidesUnpainted(slides);
  });

  it('last-slide comment recolors only © teamver text', () => {
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: pitchDeck(),
      commentAttachments: [commentOn(7)],
      instructionText: COMMENT,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('text-color');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(footerHtml(slides[7]?.outerHtml ?? '')).toMatch(/color:\s*#dc2626/i);
    expect(slides[7]?.outerHtml).toContain('Teamver와 함께 다음을 연다');
    expect(slides[7]?.outerHtml).not.toMatch(/--paper:\s*#dc2626/i);
    expect(chipHtml(slides[1]?.outerHtml ?? '')).toMatch(/background:\s*#99E885/i);
    expect(chipHtml(slides[1]?.outerHtml ?? '')).not.toMatch(/#dc2626/i);
    expect(paragraphHtml(slides[1]?.outerHtml ?? '')).not.toMatch(/#dc2626/i);
    expect(slides[2]?.outerHtml).toContain('Teamver 워크스페이스');
    expect(slides[2]?.outerHtml).not.toMatch(/#dc2626/i);
  });

  it('empty MiniMax merge keeps 8 slides and paints the chip fill', () => {
    const result = mergeCommentEditIncomingIntoPrior({
      priorHtml: pitchDeck(),
      incomingHtml: '',
      commentAttachments: [commentOn(1)],
      instructionText: COMMENT,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.merged).toBe(true);
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expectChipFillRed(slides[1]?.outerHtml ?? '');
    expect(shouldSurfaceEmptyApiResponseChatError({
      commentScoped: true,
      localStyleGraftSucceeded: true,
    })).toBe(false);
  });

  it('short incoming rewrite does not replace titles; only the chip fill goes red', () => {
    const incoming =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h2>완전히 다른 제목</h2><p>날조된 본문</p></section>'
      + '</body></html>';
    const result = mergeCommentEditIncomingIntoPrior({
      priorHtml: pitchDeck(),
      incomingHtml: incoming,
      commentAttachments: [commentOn(1)],
      instructionText: COMMENT,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(slides[1]?.outerHtml).toContain('문제');
    expect(slides[1]?.outerHtml).not.toContain('완전히 다른 제목');
    expectChipFillRed(slides[1]?.outerHtml ?? '');
  });

  it('same-slide title, paragraph, wrapper, and extra chip stay unpainted; only the last chip fill goes red', () => {
    const prior = [
      '<!doctype html><html lang="ko"><body>',
      '<section class="slide" data-slide-index="0"><h2>표지</h2></section>',
      '<section class="slide" data-slide-index="1" style="--paper:#f4efe4">',
      '<h2>Teamver</h2>',
      '<p>Teamver 워크스페이스에서 초안을 고친다</p>',
      '<div class="wrap"><div id="upper-chip" style="background:#99E885">Teamver</div></div>',
      '<div id="bottom-chip" style="background:#99E885;font-size:32px;font-weight:800">Teamver</div>',
      '<svg><text>Teamver</text></svg>',
      '</section>',
      '<section class="slide" data-slide-index="2"><h2>슬라이드 3</h2><p>Teamver 워크스페이스</p></section>',
      ...Array.from({ length: 5 }, (_, i) =>
        `<section class="slide" data-slide-index="${i + 3}"><h2>슬라이드 ${i + 4}</h2></section>`,
      ),
      '</body></html>',
    ].join('');
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: prior,
      commentAttachments: [commentOn(1)],
      instructionText: COMMENT,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    const html = slides[1]?.outerHtml ?? '';
    expect(html).not.toMatch(/<h2[^>]*(?:color|background(?:-color)?):\s*#dc2626[^>]*>\s*Teamver/i);
    expect(paragraphHtml(html)).not.toMatch(/#dc2626/i);
    expect(html).not.toMatch(/<div class="wrap"[^>]*(?:color|background(?:-color)?):\s*#dc2626/i);
    expect(html).not.toMatch(/id="upper-chip"[^>]*(?:color|background(?:-color)?):\s*#dc2626/i);
    expect(html).toMatch(/id="bottom-chip"[^>]*background(?:-color)?:\s*#dc2626/i);
    expect(html).not.toMatch(/id="bottom-chip"[^>]*background:\s*#99E885/i);
    expect(html).not.toMatch(/<text[^>]*color:\s*#dc2626/i);
    expect(html).not.toMatch(/--paper:\s*#dc2626/i);
    expect(slides[2]?.outerHtml).toContain('Teamver 워크스페이스');
    expect(slides[2]?.outerHtml).not.toMatch(/#dc2626/i);
  });

  it('retry of the same comment does not fail or paint the slide paper', () => {
    const first = graftLocalCommentStyleOntoPrior({
      priorHtml: pitchDeck(),
      commentAttachments: [commentOn(1)],
      instructionText: COMMENT,
    });
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (!first.ok) return;
    const second = graftLocalCommentStyleOntoPrior({
      priorHtml: first.html,
      commentAttachments: [commentOn(1)],
      instructionText: COMMENT,
    });
    expect(second.ok, JSON.stringify(second)).toBe(true);
    if (!second.ok) return;
    expect(second.kind).toBe('chip-fill');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(second.html));
    expect(slides).toHaveLength(8);
    expectChipFillRed(slides[1]?.outerHtml ?? '');
    expect(slides[1]?.outerHtml).not.toMatch(/--paper:\s*#dc2626/i);
    expect(shouldSurfaceEmptyApiResponseChatError({
      commentScoped: true,
      localStyleGraftSucceeded: true,
    })).toBe(false);
  });
});

describe('1007-N01 Z selected-element color never paints slide paper', () => {
  const CREAM = '#f4efe4';
  const DOTS =
    `background-image:radial-gradient(circle, #111 1.2px, transparent 1.2px);`
    + 'background-size:18px 18px';

  function creamDotsDeck(): string {
    return [
      '<!doctype html><html lang="ko"><head><style>:root{--paper:#f4efe4}</style></head><body>',
      `<section class="slide" data-slide-index="0" style="--paper:${CREAM}"><h2>표지</h2></section>`,
      `<section class="slide" data-slide-index="1" style="--paper:${CREAM};background-color:${CREAM};${DOTS}">`,
      '<h2>지금 팀의 일은 너무 많이 흩어져 있습니다.</h2>',
      '<p>대화는 메신저에, 문서는 노션에</p>',
      '<div class="card">SLACK 대화</div><div class="card">NOTION 문서</div>',
      '<div class="card">DRIVE 파일</div><div class="card">CHATGPT AI</div>',
      '<div style="position:relative;display:flex;align-items:center;gap:24px">',
      '<div>→</div>',
      '<div data-od-id="chip-teamver" data-od-edit-id="chip-teamver" style="background:#99E885;font-size:32px;font-weight:800">Teamver</div>',
      '</div>',
      '</section>',
      `<section class="slide" data-slide-index="2" style="--paper:${CREAM}">`,
      '<h2>슬라이드 3</h2><p>Teamver 워크스페이스</p></section>',
      ...Array.from({ length: 4 }, (_, i) =>
        `<section class="slide" data-slide-index="${i + 3}" style="--paper:${CREAM}">`
        + `<h2>슬라이드 ${i + 4}</h2><p>본문입니다.</p></section>`,
      ),
      `<section class="slide" data-slide-index="7" style="--paper:${CREAM}">`,
      '<h2>Closing</h2><span>© teamver</span></section>',
      '</body></html>',
    ].join('');
  }

  function chipComment(comment: string): ChatCommentAttachment {
    return {
      id: 'c-chip-red',
      order: 1,
      filePath: 'deck.html',
      elementId: 'chip-teamver',
      selector: '[data-od-id="chip-teamver"]',
      label: 'div',
      comment,
      currentText: 'Teamver',
      htmlHint: '<div data-od-id="chip-teamver" style="background:#99E885">Teamver</div>',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
  }

  function slidePinComment(comment: string): ChatCommentAttachment {
    return {
      id: 'c-slide-pin',
      order: 1,
      filePath: 'deck.html',
      elementId: 'pin-slide-1',
      selector: 'section.slide',
      label: 'section',
      comment,
      currentText: '',
      htmlHint: '',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
  }

  function chipHtml(slideHtml: string): string | null {
    return slideHtml.match(/<div[^>]*data-od-id="chip-teamver"[^>]*>\s*Teamver\s*<\/div>/i)?.[0]
      ?? slideHtml.match(/<div[^>]*>\s*Teamver\s*<\/div>/i)?.[0]
      ?? null;
  }

  function expectChipFillRed(slideHtml: string): void {
    const chip = chipHtml(slideHtml);
    expect(chip).toMatch(/background(?:-color)?:\s*#dc2626/i);
    expect(chip).not.toMatch(/background(?:-color)?:\s*#99E885/i);
    expect(chip).toContain('Teamver');
  }

  function expectSlidePaperCream(slideHtml: string, openTag: string): void {
    expect(openTag).toMatch(/--paper:\s*#f4efe4/i);
    expect(openTag).not.toMatch(/--paper:\s*#dc2626/i);
    expect(openTag).not.toMatch(/background(?:-color)?:\s*#dc2626/i);
    expect(slideHtml).toMatch(/radial-gradient/i);
  }

  it('classifies selected-element 빨간색으로 as element fill, not slide paper', () => {
    const onChip = chipComment('빨간색으로');
    expect(commentAttachmentHasElementTarget(onChip)).toBe(true);
    expect(commentAttachmentHasElementTarget(slidePinComment('배경색을 빨간색으로'))).toBe(false);
    expect(isNamedTextColorCommentInstruction('빨간색으로')).toBe(false);
    expect(isBackgroundColorCommentInstruction('빨간색으로')).toBe(false);
    expect(canGraftLocalCommentStyleWithoutModel('빨간색으로')).toBe(false);
    expect(canGraftLocalCommentStyleWithoutModel('빨간색으로', [onChip])).toBe(true);
    expect(canGraftLocalCommentStyleWithoutModel('배경색을 빨간색으로', [onChip])).toBe(true);
    expect(canGraftLocalCommentStyleWithoutModel('배경색을 빨간색으로')).toBe(true);
    expect(isNamedTextColorCommentInstruction('배경색을 빨간색으로')).toBe(false);
  });

  it('chip comment 빨간색으로 paints the Teamver chip only; slide stays cream+dots', () => {
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: creamDotsDeck(),
      commentAttachments: [chipComment('빨간색으로')],
      instructionText: '빨간색으로',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('chip-fill');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expectChipFillRed(slides[1]?.outerHtml ?? '');
    expectSlidePaperCream(slides[1]?.outerHtml ?? '', slides[1]?.openTag ?? '');
    expect(slides[1]?.outerHtml).toContain('지금 팀의 일은 너무 많이 흩어져 있습니다.');
    expect(slides[1]?.outerHtml).toContain('<div>→</div>');
    expect(slides[2]?.outerHtml).toContain('Teamver 워크스페이스');
    expect(slides[2]?.outerHtml).not.toMatch(/#dc2626/i);
    expect(slides[0]?.outerHtml).not.toMatch(/#dc2626/i);
  });

  it('배경색을 빨간색으로 on the selected chip still fills the chip, not --paper', () => {
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: creamDotsDeck(),
      commentAttachments: [chipComment('배경색을 빨간색으로')],
      instructionText: '배경색을 빨간색으로',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('chip-fill');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expectChipFillRed(slides[1]?.outerHtml ?? '');
    expectSlidePaperCream(slides[1]?.outerHtml ?? '', slides[1]?.openTag ?? '');
  });

  it('slide-level 배경색을 빨간색으로 paints paper red and leaves the green chip', () => {
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: creamDotsDeck(),
      commentAttachments: [slidePinComment('배경색을 빨간색으로')],
      instructionText: '배경색을 빨간색으로',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('background');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(slides[1]?.openTag).toMatch(/--paper:\s*#dc2626/i);
    expect(chipHtml(slides[1]?.outerHtml ?? '')).toMatch(/background:\s*#99E885/i);
    expect(chipHtml(slides[1]?.outerHtml ?? '')).not.toMatch(/#dc2626/i);
    expect(slides[0]?.outerHtml).not.toMatch(/--paper:\s*#dc2626/i);
    expect(slides[2]?.outerHtml).not.toMatch(/#dc2626/i);
  });

  it('글자만 on the selected chip colors text only', () => {
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: creamDotsDeck(),
      commentAttachments: [chipComment('글자만 빨간색으로')],
      instructionText: '글자만 빨간색으로',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('text-color');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    const chip = chipHtml(slides[1]?.outerHtml ?? '');
    expect(chip).toMatch(/color:\s*#dc2626/i);
    expect(chip).toMatch(/background:\s*#99E885/i);
    expectSlidePaperCream(slides[1]?.outerHtml ?? '', slides[1]?.openTag ?? '');
  });

  it('slide-level 빨간색으로 without Teamver does not paint paper or the chip', () => {
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: creamDotsDeck(),
      commentAttachments: [slidePinComment('빨간색으로')],
      instructionText: '빨간색으로',
    });
    expect(result.ok).toBe(false);
  });

  it('empty MiniMax merge keeps 8 slides and paints only the chip', () => {
    const result = mergeCommentEditIncomingIntoPrior({
      priorHtml: creamDotsDeck(),
      incomingHtml: '',
      commentAttachments: [chipComment('빨간색으로')],
      instructionText: '빨간색으로',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expectChipFillRed(slides[1]?.outerHtml ?? '');
    expectSlidePaperCream(slides[1]?.outerHtml ?? '', slides[1]?.openTag ?? '');
  });

  it('incoming red-paper 1-slide does not wipe cream paper when the chip is selected', () => {
    const incoming =
      '<!doctype html><html lang="ko"><body>'
      + `<section class="slide" style="--paper:#dc2626;background:#dc2626">`
      + '<h2>완전히 다른 제목</h2><div style="background:#99E885">Teamver</div>'
      + '</section></body></html>';
    const result = mergeCommentEditIncomingIntoPrior({
      priorHtml: creamDotsDeck(),
      incomingHtml: incoming,
      commentAttachments: [chipComment('배경색을 빨간색으로')],
      instructionText: '배경색을 빨간색으로',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(slides[1]?.outerHtml).toContain('지금 팀의 일은 너무 많이 흩어져 있습니다.');
    expect(slides[1]?.outerHtml).not.toContain('완전히 다른 제목');
    expectChipFillRed(slides[1]?.outerHtml ?? '');
    expectSlidePaperCream(slides[1]?.outerHtml ?? '', slides[1]?.openTag ?? '');
  });

  it('stale path-N id + htmlHint still fills the chip, not paper', () => {
    const stale: ChatCommentAttachment = {
      ...chipComment('빨간색으로'),
      elementId: 'path-9-9',
      selector: 'div',
    };
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: creamDotsDeck(),
      commentAttachments: [stale],
      instructionText: '빨간색으로',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('chip-fill');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expectChipFillRed(slides[1]?.outerHtml ?? '');
    expectSlidePaperCream(slides[1]?.outerHtml ?? '', slides[1]?.openTag ?? '');
  });

  it('named Teamver on a slide pin still fills the bottom chip, not paper', () => {
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: creamDotsDeck(),
      commentAttachments: [slidePinComment('맨 아래 Teamver를 빨간색으로')],
      instructionText: '맨 아래 Teamver를 빨간색으로',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('chip-fill');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expectChipFillRed(slides[1]?.outerHtml ?? '');
    expectSlidePaperCream(slides[1]?.outerHtml ?? '', slides[1]?.openTag ?? '');
  });
});

describe('1007-N01 AA card title color and 1-slide identity stamp', () => {
  const CREAM = '#f4efe4';
  const DOTS =
    `background-image:radial-gradient(circle, #111 1.2px, transparent 1.2px);`
    + 'background-size:18px 18px';

  function cardWithTitleDeck(): string {
    return [
      '<!doctype html><html lang="ko"><head><style>:root{--paper:#f4efe4}</style></head><body>',
      `<section class="slide" data-slide-index="0" style="--paper:${CREAM}"><h2>표지</h2></section>`,
      `<section class="slide" data-slide-index="1" style="--paper:${CREAM};background-color:${CREAM}">`,
      '<div class="card" data-od-id="card-box" style="background:#ffffff;padding:24px">',
      '<h2 data-od-id="card-title">카드 제목</h2>',
      '<p data-od-id="card-body">카드 본문입니다.</p>',
      '</div>',
      '</section>',
      ...Array.from({ length: 6 }, (_, i) =>
        `<section class="slide" data-slide-index="${i + 2}" style="--paper:${CREAM}">`
        + `<h2>슬라이드 ${i + 3}</h2><p>본문입니다.</p></section>`,
      ),
      '</body></html>',
    ].join('');
  }

  function creamDotsDeck(): string {
    return [
      '<!doctype html><html lang="ko"><head><style>:root{--paper:#f4efe4}</style></head><body>',
      `<section class="slide" data-slide-index="0" style="--paper:${CREAM}"><h1>표지 타이틀</h1></section>`,
      `<section class="slide" data-slide-index="1" style="--paper:${CREAM};background-color:${CREAM};${DOTS}">`,
      '<h2 data-od-id="page2-title">지금 팀의 일은 너무 많이 흩어져 있습니다.</h2>',
      '<p data-od-id="page2-body">대화는 메신저에, 문서는 노션에</p>',
      '<div class="card">SLACK 대화</div><div class="card">NOTION 문서</div>',
      '<div style="position:relative;display:flex;align-items:center;gap:24px">',
      '<div>→</div>',
      '<div data-od-id="chip-teamver" data-od-edit-id="chip-teamver" style="background:#99E885;font-size:32px;font-weight:800">',
      '<span data-od-id="chip-text">Teamver</span>',
      '</div>',
      '</div>',
      '</section>',
      ...Array.from({ length: 5 }, (_, i) =>
        `<section class="slide" data-slide-index="${i + 2}" style="--paper:${CREAM}">`
        + `<h2>슬라이드 ${i + 3}</h2><p>본문입니다.</p></section>`,
      ),
      `<section class="slide" data-slide-index="7" style="--paper:${CREAM}">`,
      '<h2>Closing</h2><span>© teamver</span></section>',
      '</body></html>',
    ].join('');
  }

  function titleComment(comment: string): ChatCommentAttachment {
    return {
      id: 'c-card-title',
      order: 1,
      filePath: 'deck.html',
      elementId: 'card-title',
      selector: '[data-od-id="card-title"]',
      label: 'h2',
      comment,
      currentText: '카드 제목',
      htmlHint: '<h2 data-od-id="card-title">카드 제목</h2>',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
  }

  function chipTextComment(comment: string): ChatCommentAttachment {
    return {
      id: 'c-chip-text',
      order: 1,
      filePath: 'deck.html',
      elementId: 'chip-text',
      selector: '[data-od-id="chip-text"]',
      label: 'span',
      comment,
      currentText: 'Teamver',
      htmlHint: '<span data-od-id="chip-text">Teamver</span>',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
  }

  function chipBoxComment(comment: string): ChatCommentAttachment {
    return {
      id: 'c-chip-box',
      order: 1,
      filePath: 'deck.html',
      elementId: 'chip-teamver',
      selector: '[data-od-id="chip-teamver"]',
      label: 'div',
      comment,
      currentText: 'Teamver',
      htmlHint: '<div data-od-id="chip-teamver" style="background:#99E885">Teamver</div>',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
  }

  function deletePage2Comment(): ChatCommentAttachment {
    return {
      id: 'c-delete-p2',
      order: 1,
      filePath: 'deck.html',
      elementId: 'pin-slide-1',
      selector: 'section.slide',
      label: 'section',
      comment: '지워줘',
      currentText: '',
      htmlHint: '',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
  }

  function fontComment(): ChatCommentAttachment {
    return {
      id: 'c-font-aa',
      order: 1,
      filePath: 'deck.html',
      elementId: 'card-title',
      selector: '[data-od-id="card-title"]',
      label: 'h2',
      comment: '폰트를 두배 키우자',
      currentText: '카드 제목',
      htmlHint: '<h2 data-od-id="card-title">카드 제목</h2>',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
  }

  function cardHtml(slideHtml: string): string | null {
    return slideHtml.match(/<div[^>]*data-od-id="card-box"[^>]*>[\s\S]*?<\/div>/i)?.[0] ?? null;
  }

  function titleHtml(slideHtml: string): string | null {
    return slideHtml.match(/<h2[^>]*data-od-id="card-title"[^>]*>[\s\S]*?<\/h2>/i)?.[0] ?? null;
  }

  function chipBoxHtml(slideHtml: string): string | null {
    return slideHtml.match(/<div[^>]*data-od-id="chip-teamver"[^>]*>[\s\S]*?<\/div>/i)?.[0] ?? null;
  }

  it('selected h2 inside a filled card 빨간색으로 paints title color, not the card', () => {
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: cardWithTitleDeck(),
      commentAttachments: [titleComment('빨간색으로')],
      instructionText: '빨간색으로',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('text-color');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(titleHtml(slides[1]?.outerHtml ?? '')).toMatch(/color:\s*#dc2626/i);
    expect(cardHtml(slides[1]?.outerHtml ?? '')).toMatch(/background:\s*#ffffff/i);
    expect(cardHtml(slides[1]?.outerHtml ?? '')).not.toMatch(/background(?:-color)?:\s*#dc2626/i);
    expect(slides[1]?.openTag).not.toMatch(/--paper:\s*#dc2626/i);
    expect(slides[1]?.outerHtml).toContain('카드 본문입니다.');
  });

  it('selected h2 inside a filled card 배경색을 빨간색으로 fills the title node, not the card', () => {
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: cardWithTitleDeck(),
      commentAttachments: [titleComment('배경색을 빨간색으로')],
      instructionText: '배경색을 빨간색으로',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('chip-fill');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(titleHtml(slides[1]?.outerHtml ?? '')).toMatch(/background(?:-color)?:\s*#dc2626/i);
    expect(cardHtml(slides[1]?.outerHtml ?? '')).toMatch(/background:\s*#ffffff/i);
    expect(slides[1]?.openTag).not.toMatch(/--paper:\s*#dc2626/i);
  });

  it('chip-inside-text 빨간색으로 still fills the Teamver chip, not a parent card', () => {
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: creamDotsDeck(),
      commentAttachments: [chipTextComment('빨간색으로')],
      instructionText: '빨간색으로',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('chip-fill');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    const chip = chipBoxHtml(slides[1]?.outerHtml ?? '');
    expect(chip).toMatch(/background(?:-color)?:\s*#dc2626/i);
    expect(chip).not.toMatch(/background(?:-color)?:\s*#99E885/i);
    expect(chip).toContain('Teamver');
    expect(slides[1]?.openTag).toMatch(/--paper:\s*#f4efe4/i);
    expect(slides[1]?.outerHtml).toMatch(/radial-gradient/i);
    expect(slides[1]?.outerHtml).toContain('지금 팀의 일은 너무 많이 흩어져 있습니다.');
  });

  it('Z regression: selected Teamver chip 빨간색으로 / 배경색을 still fills chip; slide-level paints paper', () => {
    const chipRed = graftLocalCommentStyleOntoPrior({
      priorHtml: creamDotsDeck(),
      commentAttachments: [chipBoxComment('빨간색으로')],
      instructionText: '빨간색으로',
    });
    expect(chipRed.ok, JSON.stringify(chipRed)).toBe(true);
    if (!chipRed.ok) return;
    expect(chipRed.kind).toBe('chip-fill');
    const chipSlides = extractTopLevelSlideSections(extractDeckBodyContent(chipRed.html));
    expect(chipBoxHtml(chipSlides[1]?.outerHtml ?? '')).toMatch(/background(?:-color)?:\s*#dc2626/i);
    expect(chipSlides[1]?.openTag).toMatch(/--paper:\s*#f4efe4/i);
    expect(chipSlides[1]?.outerHtml).toMatch(/radial-gradient/i);

    const chipBg = graftLocalCommentStyleOntoPrior({
      priorHtml: creamDotsDeck(),
      commentAttachments: [chipBoxComment('배경색을 빨간색으로')],
      instructionText: '배경색을 빨간색으로',
    });
    expect(chipBg.ok, JSON.stringify(chipBg)).toBe(true);
    if (!chipBg.ok) return;
    const bgSlides = extractTopLevelSlideSections(extractDeckBodyContent(chipBg.html));
    expect(chipBoxHtml(bgSlides[1]?.outerHtml ?? '')).toMatch(/background(?:-color)?:\s*#dc2626/i);
    expect(bgSlides[1]?.openTag).toMatch(/--paper:\s*#f4efe4/i);

    const slidePin: ChatCommentAttachment = {
      ...chipBoxComment('배경색을 빨간색으로'),
      id: 'c-slide-paper',
      elementId: 'pin-slide-1',
      selector: 'section.slide',
      htmlHint: '',
      currentText: '',
    };
    const paper = graftLocalCommentStyleOntoPrior({
      priorHtml: creamDotsDeck(),
      commentAttachments: [slidePin],
      instructionText: '배경색을 빨간색으로',
    });
    expect(paper.ok, JSON.stringify(paper)).toBe(true);
    if (!paper.ok) return;
    expect(paper.kind).toBe('background');
    const paperSlides = extractTopLevelSlideSections(extractDeckBodyContent(paper.html));
    expect(paperSlides[1]?.openTag).toMatch(/--paper:\s*#dc2626/i);
    expect(chipBoxHtml(paperSlides[1]?.outerHtml ?? '')).toMatch(/background:\s*#99E885/i);
  });

  it('2페이지 지워줘 + cover-only incoming keeps page 2 and does not stamp the cover', () => {
    const incoming =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide s-cover" data-slide-index="0">'
      + '<h1>표지 타이틀</h1><p>한 줄 표지.</p>'
      + '</section></body></html>';
    const result = mergeCommentEditIncomingIntoPrior({
      priorHtml: creamDotsDeck(),
      incomingHtml: incoming,
      commentAttachments: [deletePage2Comment()],
      instructionText: '2페이지 지워줘',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('comment 1-slide incoming did not match pinned slide');

    const aligned = alignShortCommentIncomingToPriorDeck({
      priorHtml: creamDotsDeck(),
      incomingHtml: incoming,
      commentAttachments: [deletePage2Comment()],
    });
    expect(aligned).toBe(incoming);
    const priorSlides = extractTopLevelSlideSections(extractDeckBodyContent(creamDotsDeck()));
    expect(priorSlides).toHaveLength(8);
    expect(priorSlides[1]?.outerHtml).toContain('지금 팀의 일은 너무 많이 흩어져 있습니다.');
    expect(priorSlides[1]?.outerHtml).not.toContain('s-cover');
    expect(shouldSurfaceEmptyApiResponseChatError({
      commentScoped: true,
      localStyleGraftSucceeded: false,
    })).toBe(true);
  });

  it('identity-matching 1-slide incoming still replaces the pinned slide', () => {
    const incoming =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide">'
      + '<h2 data-od-id="page2-title">지금 팀의 일은 너무 많이 흩어져 있습니다.</h2>'
      + '<p data-od-id="page2-body">로컬 삭제는 없지만 같은 장이다.</p>'
      + '</section></body></html>';
    const result = mergeCommentEditIncomingIntoPrior({
      priorHtml: creamDotsDeck(),
      incomingHtml: incoming,
      commentAttachments: [deletePage2Comment()],
      instructionText: '2페이지 지워줘',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.merged).toBe(true);
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(slides[1]?.outerHtml).toContain('로컬 삭제는 없지만 같은 장이다.');
    expect(slides[1]?.outerHtml).toContain('지금 팀의 일은 너무 많이 흩어져 있습니다.');
    expect(slides[1]?.openTag).not.toMatch(/\bs-cover\b/i);
    expect(slides[0]?.outerHtml).toContain('표지 타이틀');
    expect(slides[2]?.outerHtml).toContain('슬라이드 3');
  });

  it('X font×2 still doubles pinned title+body only', () => {
    const prior = [
      '<!doctype html><html lang="ko"><body>',
      ...Array.from({ length: 8 }, (_, i) =>
        `<section class="slide" data-slide-index="${i}">`
        + `<p class="kicker" style="font-size:12px">KICKER ${i + 1}</p>`
        + `<h2 style="font-size:32px">슬라이드 ${i + 1}</h2>`
        + `<p style="font-size:16px">본문입니다.</p>`
        + '</section>',
      ),
      '</body></html>',
    ].join('');
    const result = graftLocalCommentStyleOntoPrior({
      priorHtml: prior,
      commentAttachments: [{ ...fontComment(), slideIndex: 2, currentText: '슬라이드 3' }],
      instructionText: '폰트를 두배 키우자',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('font-scale');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(slides[2]?.outerHtml).toMatch(/font-size:\s*64px/i);
    expect(slides[2]?.outerHtml).toMatch(/font-size:\s*32px/i);
    expect(slides[2]?.outerHtml).toMatch(/font-size:\s*12px/i);
    expect(slides[0]?.outerHtml).toMatch(/font-size:\s*32px/i);
    expect(slides[0]?.outerHtml).not.toMatch(/font-size:\s*64px/i);
  });

  it('1007-N01 AB · selected-element 배경색 skips MiniMax and grafts without model HTML', () => {
    const onChip = chipBoxComment('배경색을 빨간색으로');
    expect(isBackgroundColorCommentInstruction('이 요소 배경을 파랑')).toBe(true);
    expect(isBackgroundColorCommentInstruction('배경만 빨간색으로')).toBe(true);
    expect(canGraftLocalCommentStyleWithoutModel('이 요소 배경을 파랑', [onChip])).toBe(true);
    expect(shouldSkipModelForLocalCommentStyle({
      instructionText: '배경색을 빨간색으로',
      commentAttachments: [onChip],
    })).toBe(true);
    expect(shouldSkipModelForLocalCommentStyle({
      instructionText: '배경색을 빨간색으로',
      commentAttachments: [],
    })).toBe(false);
    const grafted = tryLocalCommentStyleGraftInsteadOfModel({
      priorHtml: creamDotsDeck(),
      commentAttachments: [onChip],
      instructionText: '배경색을 빨간색으로',
    });
    expect(grafted.ok, JSON.stringify(grafted)).toBe(true);
    if (!grafted.ok) return;
    expect(grafted.kind).toBe('chip-fill');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(grafted.html));
    expect(slides).toHaveLength(8);
    expect(chipBoxHtml(slides[1]?.outerHtml ?? '')).toMatch(/background(?:-color)?:\s*#dc2626/i);
    expect(slides[1]?.openTag).toMatch(/--paper:\s*#f4efe4/i);
    expect(slides[1]?.openTag).not.toMatch(/--paper:\s*#dc2626/i);
  });

  it('1007-N01 AB · merge miss + local bg graft still paints the selected chip', () => {
    const mismatchedPatch = {
      ops: [{
        op: 'replace' as const,
        slideIndex: 1,
        html: '<section class="slide" data-slide-index="1"><h2>다른 제목</h2><p>타깃 없음</p></section>',
      }],
    };
    const result = applyScopedDeckPatchToHtml({
      currentHtml: creamDotsDeck(),
      patch: mismatchedPatch,
      commentAttachments: [chipBoxComment('배경색을 빨간색으로')],
      instructionText: '배경색을 빨간색으로',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(result.html));
    expect(slides).toHaveLength(8);
    expect(chipBoxHtml(slides[1]?.outerHtml ?? '')).toMatch(/background(?:-color)?:\s*#dc2626/i);
    expect(slides[1]?.openTag).toMatch(/--paper:\s*#f4efe4/i);
    expect(slides[1]?.outerHtml).toContain('지금 팀의 일은 너무 많이 흩어져 있습니다.');
  });
});
