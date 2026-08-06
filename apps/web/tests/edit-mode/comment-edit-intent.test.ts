// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  looksLikeMarkupLayoutCommentRequest,
  looksLikePresentationTweakCommentRequest,
  looksLikeStyleOnlyCommentRequest,
  targetTextContentPreserved,
  validateCommentEditIntentRespected,
} from '../../src/edit-mode/comment-edit-intent';
import type { ChatCommentAttachment } from '../../src/types';

const intentSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/edit-mode/comment-edit-intent.ts'),
  'utf8',
);

function attachment(overrides: Partial<ChatCommentAttachment> = {}): ChatCommentAttachment {
  return {
    id: 'c1',
    order: 1,
    filePath: 'deck.html',
    elementId: 'path-1-1',
    selector: '[data-od-id="path-1-1"]',
    label: 'p',
    comment: '텍스트 더 크게 키워줘',
    currentText: '뉴럴스튜디오㈜는 회사입니다.',
    pagePosition: { x: 0, y: 0, width: 10, height: 10 },
    htmlHint: '<p data-od-id="path-1-1">',
    selectionKind: 'element',
    slideIndex: 1,
    ...overrides,
  };
}

describe('looksLikeStyleOnlyCommentRequest', () => {
  it('detects Korean size/emphasis requests', () => {
    expect(looksLikeStyleOnlyCommentRequest('텍스트 더 크게 키워줘')).toBe(true);
    expect(looksLikeStyleOnlyCommentRequest('회사 이름 눈에 잘 띄게 수정')).toBe(true);
  });

  it('does not treat explicit text replacement as style-only', () => {
    expect(looksLikeStyleOnlyCommentRequest("텍스트를 '새 이름'으로 바꿔줘")).toBe(false);
  });

  it('does not treat layout-only requests as style-only', () => {
    expect(looksLikeStyleOnlyCommentRequest('줄바꿈 없이 한줄로 해줘')).toBe(false);
  });
});

describe('looksLikeMarkupLayoutCommentRequest', () => {
  it('detects Korean line-break / single-line layout requests', () => {
    expect(looksLikeMarkupLayoutCommentRequest('줄바꿈 없이 한줄로 해줘')).toBe(true);
    expect(looksLikeMarkupLayoutCommentRequest('한 줄로 맞춰줘')).toBe(true);
    expect(looksLikeMarkupLayoutCommentRequest('nowrap으로 표시')).toBe(true);
  });

  it('does not treat explicit text replacement as layout-only', () => {
    expect(looksLikeMarkupLayoutCommentRequest("텍스트를 '새 이름'으로 바꿔줘")).toBe(false);
  });
});

describe('validateCommentEditIntentRespected', () => {
  const currentHtml = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Intro</h1></section>
<section class="slide" data-slide-index="1">
  <p data-od-id="path-1-1">뉴럴스튜디오㈜는 회사입니다.</p>
</section>
</body></html>`;

  it('rejects when a style-only request emptied the pinned target text', () => {
    const mergedHtml = currentHtml.replace(
      '<p data-od-id="path-1-1">뉴럴스튜디오㈜는 회사입니다.</p>',
      '<p data-od-id="path-1-1" style="font-size:48px"></p>',
    );
    const result = validateCommentEditIntentRespected({
      mergedHtml,
      commentAttachments: [attachment()],
      instructionText: '텍스트 더 크게 키워줘',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('presentation-only');
    }
  });

  it('rejects when a layout-only request emptied the pinned target text', () => {
    const mergedHtml = currentHtml.replace(
      '<p data-od-id="path-1-1">뉴럴스튜디오㈜는 회사입니다.</p>',
      '<p data-od-id="path-1-1" style="white-space:nowrap"></p>',
    );
    expect(looksLikePresentationTweakCommentRequest('줄바꿈 없이 한줄로 해줘')).toBe(true);
    const result = validateCommentEditIntentRespected({
      mergedHtml,
      commentAttachments: [attachment({ comment: '줄바꿈 없이 한줄로 해줘' })],
      instructionText: '줄바꿈 없이 한줄로 해줘',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('presentation-only');
    }
  });

  it('accepts when layout tweak kept the text', () => {
    const mergedHtml = currentHtml.replace(
      '<p data-od-id="path-1-1">뉴럴스튜디오㈜는 회사입니다.</p>',
      '<p data-od-id="path-1-1" style="white-space:nowrap">뉴럴스튜디오㈜는 회사입니다.</p>',
    );
    const result = validateCommentEditIntentRespected({
      mergedHtml,
      commentAttachments: [attachment({ comment: '줄바꿈 없이 한줄로 해줘' })],
      instructionText: '줄바꿈 없이 한줄로 해줘',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts when set-style kept the text and only presentation changed', () => {
    const mergedHtml = currentHtml.replace(
      '<p data-od-id="path-1-1">뉴럴스튜디오㈜는 회사입니다.</p>',
      '<p data-od-id="path-1-1" style="font-size:48px">뉴럴스튜디오㈜는 회사입니다.</p>',
    );
    const result = validateCommentEditIntentRespected({
      mergedHtml,
      commentAttachments: [attachment()],
      instructionText: '텍스트 더 크게 키워줘',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts when attachment.slideIndex is stale but the target text survives on another slide', () => {
    const mergedHtml = currentHtml.replace(
      '<p data-od-id="path-1-1">뉴럴스튜디오㈜는 회사입니다.</p>',
      '<p data-od-id="path-1-1" style="font-size:48px"><span style="font-weight:900">뉴럴스튜디오㈜</span>는 회사입니다.</p>',
    );
    const result = validateCommentEditIntentRespected({
      mergedHtml,
      commentAttachments: [attachment({ slideIndex: 0, elementId: 'path-1-1' })],
      instructionText: '회사 이름 눈에 잘 띄게 수정',
    });
    expect(result.ok).toBe(true);
  });
});

describe('targetTextContentPreserved', () => {
  it('requires most tokens to survive on the target element', () => {
    expect(targetTextContentPreserved(
      { currentText: '뉴럴스튜디오㈜는 회사입니다.' },
      '뉴럴스튜디오㈜는 회사입니다.',
    )).toBe(true);
    expect(targetTextContentPreserved(
      { currentText: '뉴럴스튜디오㈜는 회사입니다.' },
      '',
    )).toBe(false);
  });
});

describe('comment-edit-intent Document slide list', () => {
  it('derives slide indexes from parsedDoc without body extract', () => {
    expect(intentSource).toContain('INTENT_STRUCTURED_SLIDE_SELECTOR');
    expect(intentSource).toContain('listDeckSlideIndexes(mergedHtml, parsedDoc)');
    expect(intentSource).toContain('When finalize already shared a Document');
  });
});
