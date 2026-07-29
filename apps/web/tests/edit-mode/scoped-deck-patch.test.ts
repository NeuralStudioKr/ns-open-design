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
});
