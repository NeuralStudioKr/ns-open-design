// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  applyElementPatches,
  normalizeElementPatchTargetsForApply,
  parseElementPatch,
} from '../../src/artifacts/element-patch';
import type { ChatCommentAttachment } from '../../src/types';

const CURRENT_HTML = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Intro</h1></section>
<section class="slide" data-slide-index="1">
  <div><div><p data-od-id="company-name">회사 이름</p></div></div>
</section>
</body></html>`;

const DOM_TARGET_ID =
  'dom:body > div:nth-of-type(1) > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > p:nth-of-type(1)';

const COMMENT_ATTACHMENT: ChatCommentAttachment = {
  id: 'comment-1',
  order: 1,
  filePath: 'deck.html',
  elementId: DOM_TARGET_ID,
  selector:
    'body > div:nth-of-type(1) > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > p:nth-of-type(1)',
  label: 'p',
  comment: '뉴럴스튜디오로 바꿔줘',
  currentText: '회사 이름',
  pagePosition: { x: 0, y: 0, width: 0, height: 0 },
  htmlHint: '<p>회사 이름</p>',
  selectionKind: 'element',
  slideIndex: 1,
};

describe('element-patch dom: target resolution', () => {
  it('normalizes preview-only dom: selectors to stable deck ids', () => {
    const parsed = parseElementPatch(
      `<patch target-id="${DOM_TARGET_ID}" slide-index="1" kind="set-text">뉴럴스튜디오</patch>`,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const normalized = normalizeElementPatchTargetsForApply({
      currentHtml: CURRENT_HTML,
      patches: parsed.patches,
      commentAttachments: [COMMENT_ATTACHMENT],
    });

    expect(normalized[0]?.id).toBe('company-name');
  });

  it('applies dom: target patches against deck HTML without preview wrapper div', () => {
    const parsed = parseElementPatch(
      `<patch target-id="${DOM_TARGET_ID}" slide-index="1" kind="set-text">뉴럴스튜디오</patch>`,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const applied = applyElementPatches({
      currentHtml: CURRENT_HTML,
      patches: parsed.patches,
      commentAttachments: [COMMENT_ATTACHMENT],
      allowedSlideIndexes: [1],
      allowedTargetIds: [DOM_TARGET_ID],
    });

    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(applied.html).toContain('뉴럴스튜디오');
    expect(applied.html).not.toContain('회사 이름');
  });

  it('accepts path-N aliases in allowedTargetIds when patch uses dom:[data-od-id]', () => {
    const deck = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><h1>Intro</h1></section>',
      '<section class="slide" data-slide-index="1"><h1>Title</h1></section>',
      '</body></html>',
    ].join('');
    const parsed = parseElementPatch(
      '<patch target-id=\'dom:[data-od-id="path-1-0"]\' slide-index="1" kind="set-text">New</patch>',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = applyElementPatches({
      currentHtml: deck,
      patches: parsed.patches,
      allowedSlideIndexes: [1],
      // Only the structural id is allow-listed — alias must still pass.
      allowedTargetIds: ['path-1-0'],
      commentAttachments: [{
        ...COMMENT_ATTACHMENT,
        elementId: 'path-1-0',
        selector: '[data-od-id="path-1-0"]',
        currentText: 'Title',
        htmlHint: '<h1>Title</h1>',
        slideIndex: 1,
      }],
    });
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
  });

  it('keeps structural path-N ids instead of minting dom:[data-od-id="path-N"]', () => {
    // Preview annotates body > section[0] > h1 as path-0-0; disk has no data-od-id.
    const deck = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><h1>Intro</h1><p>Keep</p></section>',
      '<section class="slide" data-slide-index="1"><h1>Title</h1><p>Body</p></section>',
      '</body></html>',
    ].join('');
    // path-1-0 = body.children[1] (slide 1) .children[0] (h1)
    const attachment: ChatCommentAttachment = {
      ...COMMENT_ATTACHMENT,
      elementId: 'path-1-0',
      selector: '[data-od-id="path-1-0"]',
      label: 'h1',
      comment: '제목 바꿔줘',
      currentText: 'Title',
      htmlHint: '<h1>Title</h1>',
      slideIndex: 1,
    };

    const normalized = normalizeElementPatchTargetsForApply({
      currentHtml: deck,
      patches: [{
        id: 'path-1-0',
        kind: 'set-text',
        value: 'New Title',
        slideIndex: 1,
      }],
      commentAttachments: [attachment],
    });
    expect(normalized[0]?.id).toBe('path-1-0');
    expect(normalized[0]?.id).not.toMatch(/^dom:\[/);

    const parsed = parseElementPatch(
      '<patch target-id=\'dom:[data-od-id="path-1-0"]\' slide-index="1" kind="set-text">New Title</patch>',
    );
    expect(parsed.ok, parsed.ok ? '' : parsed.reason).toBe(true);
    if (!parsed.ok) return;

    const applied = applyElementPatches({
      currentHtml: deck,
      patches: parsed.patches,
      commentAttachments: [attachment],
      allowedSlideIndexes: [1],
      allowedTargetIds: ['path-1-0', 'dom:[data-od-id="path-1-0"]'],
    });
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(applied.html).toContain('<h1>New Title</h1>');
    expect(applied.html).toContain('<p>Body</p>');
  });
});
