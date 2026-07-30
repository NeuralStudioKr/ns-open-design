// @vitest-environment jsdom
//
// End-to-end regression coverage for scoped preview-comment direct edits.
// Each case mirrors a user-reported failure mode that previously surfaced as
// `deck_patch_merge_failed` or `full_deck_outside_slide_scope`.

import { describe, expect, it } from 'vitest';
import { applyElementPatches } from '../src/artifacts/element-patch';
import { buildConcreteElementPatchTemplate } from '../src/comments';
import { looksLikeRemovalCommentRequest } from '../src/edit-mode/comment-edit-intent';
import { shouldRouteScopedCommentEditToAutoContinue } from '../src/edit-mode/scoped-comment-persist';
import {
  mergeScopedCommentTargetsFromPatchedDeck,
  scopedCommentSlideIndexesFromDeck,
} from '../src/edit-mode/scoped-deck-patch';
import type { ChatCommentAttachment } from '../src/types';

function attachment(overrides: Partial<ChatCommentAttachment> = {}): ChatCommentAttachment {
  return {
    id: 'c1',
    order: 1,
    filePath: 'deck.html',
    elementId: 'decor-1',
    selector: '[data-od-id="decor-1"]',
    label: 'div',
    comment: '왼쪽 상단 요소 삭제',
    currentText: '',
    htmlHint: '<div style="width:176px;background:#2C1A0E"></div>',
    pagePosition: { x: 0, y: 0, width: 176, height: 229 },
    selectionKind: 'element',
    slideIndex: 0,
    ...overrides,
  };
}

const CURRENT_DECK = `<!doctype html><html><body>
<section class="slide" data-slide-index="0">
  <div data-od-id="decor-1" style="width:176px;height:229px;background:#2C1A0E"></div>
  <h2 data-od-id="title-1">아이폰 시리즈 개요 및<br>발전 동향 보고서</h2>
</section>
<section class="slide" data-slide-index="1"><h2>Slide 2 original</h2></section>
</body></html>`;

describe('scoped direct-edit regression', () => {
  it('infers slide index from deck HTML when attachment.slideIndex is stale', () => {
    const indexes = scopedCommentSlideIndexesFromDeck(CURRENT_DECK, [
      attachment({ slideIndex: 99, elementId: 'title-1', selector: '[data-od-id="title-1"]' }),
    ]);
    expect(indexes).toEqual([0]);
  });

  it('routes missing slide scope to auto-continue', () => {
    expect(
      shouldRouteScopedCommentEditToAutoContinue(
        'comment_scope_missing_slide',
        'comment attachments did not include a valid slide index',
      ),
    ).toBe(true);
  });

  it('builds remove-element templates for deletion requests', () => {
    expect(looksLikeRemovalCommentRequest('왼쪽 상단 요소 삭제해줘')).toBe(true);
    const template = buildConcreteElementPatchTemplate([
      attachment({ comment: '왼쪽 상단 요소 삭제해줘' }),
    ]);
    expect(template).toContain('kind="remove-element"');
    expect(template).not.toContain('set-text');
  });

  it('applies remove-element patches without nested-markup failures', () => {
    const applied = applyElementPatches({
      currentHtml: CURRENT_DECK,
      patches: [{ id: 'decor-1', kind: 'remove-element', slideIndex: 0 }],
      allowedSlideIndexes: [0],
      allowedTargetIds: ['decor-1'],
    });
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(applied.html).not.toContain('decor-1');
    expect(applied.html).toContain('title-1');
  });

  it('narrows full-deck rewrite when deleting a decorative element', () => {
    const patched = CURRENT_DECK
      .replace(/<div data-od-id="decor-1"[^>]*><\/div>\s*/, '')
      .replace('Slide 2 original', 'Slide 2 REWRITTEN');
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml: CURRENT_DECK,
      patchedHtml: patched,
      commentAttachments: [attachment()],
      instructionText: '왼쪽 상단 요소 삭제',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.html).not.toContain('decor-1');
    expect(result.html).toContain('Slide 2 original');
    expect(result.html).not.toContain('REWRITTEN');
  });

  it('narrows layout-only br removal without touching sibling slides', () => {
    const patched = CURRENT_DECK.replace(
      '<h2 data-od-id="title-1">아이폰 시리즈 개요 및<br>발전 동향 보고서</h2>',
      '<h2 data-od-id="title-1">아이폰 시리즈 개요 및 발전 동향 보고서</h2>',
    );
    const result = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml: CURRENT_DECK,
      patchedHtml: patched,
      commentAttachments: [
        attachment({
          elementId: 'title-1',
          selector: '[data-od-id="title-1"]',
          comment: '줄바꿈 없이 한줄로 해줘',
          currentText: '아이폰 시리즈 개요 및\n발전 동향 보고서',
          htmlHint: '<h2 data-od-id="title-1">',
        }),
      ],
      instructionText: '줄바꿈 없이 한줄로 해줘',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.html).not.toContain('<br');
  });
});
