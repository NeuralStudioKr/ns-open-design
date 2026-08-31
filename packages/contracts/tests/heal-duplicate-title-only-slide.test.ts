/**
 * 루프182 · Drop consecutive duplicate title-only slides (MiniMax body-fail).
 *
 * Complements upstream 루프181 persist gate (heading-only outline refuse):
 * covers artifacts that bypass persist gate (recover/reuse read paths).
 *
 * 사용자 리포트 2026-08-31 · 삼각함수 (루프180 후속):
 *   MiniMax가 body 콘텐츠 생성에 실패하여 완전히 동일한 title-only
 *   슬라이드(`<h1>삼각함수</h1>` 만) 2장이 연속 렌더링됨. `dropTitleOnly-
 *   NumberedLeftoverSlides` 는 `삼각함수 · 2` 처럼 counter 접미사가 있어야
 *   매치하지만, 이번 fixture 는 그냥 반복. `dropEmptyLikelyDeckSlides` 는
 *   heading 안에 텍스트가 있어 empty 로 판정 안 됨.
 *
 * 새 방어 `dropDuplicateConsecutiveTitleOnlyLeftoverSlides`:
 *   - 인접한 슬라이드 두 장의 body 가 정규화된 visible text 로 완전히 동일
 *   - body 가 title-only 판정 (visible text 길이 짧음 · media 없음)
 *   - 이 조건 모두 만족 시 뒤쪽 슬라이드 drop
 *   - 첫 슬라이드는 절대 drop 안 함 (cover 만이라도 유지)
 *   - Idempotent — 두 번째 pass 는 결과 동일
 */

import { describe, expect, it } from 'vitest';
import {
  dropDuplicateConsecutiveTitleOnlyLeftoverSlides,
  healAiGeneratedDeckMarkup,
} from '../src/html/heal-ai-generated-deck.js';

const slide = (attrs: string, body: string): string =>
  `<section class="slide"${attrs ? ` ${attrs}` : ''}>${body}</section>`;

const USER_DUPLICATE_TITLE_FIXTURE = [
  '<!doctype html><html lang="ko"><body class="tpl-pitch-deck">',
  slide('style="width:1920px;height:1080px" class="slide slide-title"', '<div data-od-slide-flow=""><h1>삼각함수</h1></div>'),
  slide('style="width:1920px;height:1080px"', '<div data-od-slide-flow=""><h1>삼각함수</h1></div>'),
  '</body></html>',
].join('\n');

const brief = '삼각함수에 대해서 설명하는 피피티 만들어줘.';

describe('루프182 · dropDuplicateConsecutiveTitleOnlyLeftoverSlides', () => {
  describe('core behaviour', () => {
    it('drops the second slide when two consecutive slides share the same title-only body', () => {
      const html = [
        '<body>',
        slide('', '<h1>삼각함수</h1>'),
        slide('', '<h1>삼각함수</h1>'),
        '</body>',
      ].join('');
      const out = dropDuplicateConsecutiveTitleOnlyLeftoverSlides(html);
      const count = (out.match(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi) ?? []).length;
      expect(count).toBe(1);
      expect(out).toContain('<h1>삼각함수</h1>');
    });

    it('reduces N consecutive duplicate title-only slides to exactly 1', () => {
      const html = [
        '<body>',
        slide('', '<h1>Topic</h1>'),
        slide('', '<h1>Topic</h1>'),
        slide('', '<h1>Topic</h1>'),
        slide('', '<h1>Topic</h1>'),
        '</body>',
      ].join('');
      const out = dropDuplicateConsecutiveTitleOnlyLeftoverSlides(html);
      const count = (out.match(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi) ?? []).length;
      expect(count).toBe(1);
    });

    it('ignores whitespace / attribute drift between the two title bodies', () => {
      const html = [
        '<body>',
        slide('', '<div data-od-slide-flow=""><h1>삼각함수</h1></div>'),
        slide('', '<div data-od-slide-flow>\n  <h1>  삼각함수  </h1>\n</div>'),
        '</body>',
      ].join('');
      const out = dropDuplicateConsecutiveTitleOnlyLeftoverSlides(html);
      const count = (out.match(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi) ?? []).length;
      expect(count).toBe(1);
    });

    it('is idempotent — a second pass matches nothing new', () => {
      const html = [
        '<body>',
        slide('', '<h1>삼각함수</h1>'),
        slide('', '<h1>삼각함수</h1>'),
        '</body>',
      ].join('');
      const once = dropDuplicateConsecutiveTitleOnlyLeftoverSlides(html);
      const twice = dropDuplicateConsecutiveTitleOnlyLeftoverSlides(once);
      expect(twice).toBe(once);
    });
  });

  describe('regression guards', () => {
    it('never drops a slide that has real body content (bullets / paragraphs)', () => {
      const html = [
        '<body>',
        slide('', '<h1>삼각함수</h1>'),
        slide('', '<h2>정의</h2><p>삼각함수는 각과 비를 다루는 함수입니다.</p><ul><li>사인</li><li>코사인</li></ul>'),
        '</body>',
      ].join('');
      const out = dropDuplicateConsecutiveTitleOnlyLeftoverSlides(html);
      const count = (out.match(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi) ?? []).length;
      expect(count).toBe(2);
      expect(out).toContain('정의');
      expect(out).toContain('사인');
    });

    it('never drops the FIRST slide even when it happens to be title-only', () => {
      // Only one slide → no duplicate → no drop.
      const html = `<body>${slide('', '<h1>삼각함수</h1>')}</body>`;
      const out = dropDuplicateConsecutiveTitleOnlyLeftoverSlides(html);
      expect(out).toBe(html);
    });

    it('preserves slides carrying media (svg / img) even when text matches', () => {
      const html = [
        '<body>',
        slide('', '<h1>삼각함수</h1>'),
        slide('', '<h1>삼각함수</h1><svg viewBox="0 0 10 10"><circle r="4"/></svg>'),
        '</body>',
      ].join('');
      const out = dropDuplicateConsecutiveTitleOnlyLeftoverSlides(html);
      const count = (out.match(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi) ?? []).length;
      expect(count).toBe(2);
      expect(out).toContain('<svg');
    });

    it('does not drop non-adjacent slides with the same title (chapter divider reuse)', () => {
      // Same title appears again later after real body slides — keep both.
      const html = [
        '<body>',
        slide('', '<h1>삼각함수</h1>'),
        slide('', '<h2>정의</h2><p>각과 비를 다루는 함수입니다.</p>'),
        slide('', '<h1>삼각함수</h1>'),
        '</body>',
      ].join('');
      const out = dropDuplicateConsecutiveTitleOnlyLeftoverSlides(html);
      const count = (out.match(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi) ?? []).length;
      expect(count).toBe(3);
    });

    it('does not drop long-form bodies that happen to share their opening heading', () => {
      const longBody = '<h1>Topic</h1><p>' + 'a'.repeat(200) + '</p>';
      const html = [
        '<body>',
        slide('', longBody),
        slide('', longBody),
        '</body>',
      ].join('');
      const out = dropDuplicateConsecutiveTitleOnlyLeftoverSlides(html);
      const count = (out.match(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi) ?? []).length;
      // Long-form body → not title-only → keep both. Consecutive duplicate
      // of a 200-char body is a distinct issue (author copy/paste) and is
      // outside this heuristic's scope.
      expect(count).toBe(2);
    });
  });

  describe('end-to-end · user fixture round-trip', () => {
    it('user fixture (title-only 2 slides) collapses to 1 through healAiGeneratedDeckMarkup', () => {
      const out = healAiGeneratedDeckMarkup(USER_DUPLICATE_TITLE_FIXTURE, brief);
      const count = (out.match(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi) ?? []).length;
      expect(count).toBe(1);
      expect(out).toContain('<h1>삼각함수</h1>');
    });
  });
});
