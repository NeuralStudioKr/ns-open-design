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
});
