import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  collapseAdjacentDuplicateLabelDivs,
  dropEmptyDeckSlides,
  restyleForeignIbMagazineCover,
  salvageMalformedMiniMaxSlideMarkup,
  unwrapStrayBoldShells,
} from '../src/template-clone-fill.js';

/**
 * User report 2026-09-03 (loop394 follow-up): Zhangzara neubrutal 서비스 소개
 * deck arrived with three concurrent defects, each caught by a distinct
 * loop394 heal:
 *
 *   1. A leading empty `.slide-title` shell whose viewer showed the runtime
 *      `[od:slide_count_top_up]` placeholder as slide 1 and shifted every
 *      real slide down by one.
 *   2. Nested + orphan `<b>` tags on slide 3 that leaked bold styling into
 *      the pill row and subsequent slides:
 *         `<p>...<b>1 <b>1,200+개...</b>...</b></p><b>\n\t<div>...`
 *   3. Duplicate consecutive stat-label divs on slide 5 (`HR 운영 시간 절감`
 *      twice, `동호회 참여율` twice) — edit-turn echo twins.
 *
 * Plus a parallel loop394-후속 fix: `restyleForeignIbMagazineCover`'s 8-bit
 * orbit branch (loop390) creates a fresh `.starfield` host; when
 * `restoreAtmosphericOverlayPositioning` (loop392) runs on a subsequent
 * salvage pass it re-applies `position:absolute;inset:0;` and breaks
 * salvage idempotency. This test pins the fix.
 */
const FIXTURE_PATH = join(
  __dirname,
  'fixtures',
  'teamver-neubrutal-empty-lead-and-b-orphan.html',
);
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf8');
const BRIEF = 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.';

describe('teamver neubrutal empty-lead + b-orphan fixture (2026-09-03 user report)', () => {
  it('dropEmptyDeckSlides removes the empty leading .slide-title shell', () => {
    const before = (FIXTURE_HTML.match(/<section[^>]*>/gi) ?? []).length;
    const after = dropEmptyDeckSlides(FIXTURE_HTML);
    const afterCount = (after.match(/<section[^>]*>/gi) ?? []).length;
    expect(afterCount).toBe(before - 1);
    // The empty slide-title shell is gone.
    expect(after).not.toMatch(/<section\s+class="slide slide-title"[^>]*>\s*<div\s+data-od-slide-flow="?"?[^>]*>\s*<h1\s+style="text-align:center">\s*<\/h1>/);
    // The real 01 Cover slide survives and becomes slide 1.
    expect(after).toMatch(/data-screen-label="01 Cover"/);
  });

  it('dropEmptyDeckSlides never wipes the deck if every slide is empty', () => {
    const allEmpty = [
      '<!doctype html><html><body>',
      '<section class="slide"><div></div></section>',
      '<section class="slide"><div></div></section>',
      '</body></html>',
    ].join('');
    const after = dropEmptyDeckSlides(allEmpty);
    expect((after.match(/<section[^>]*>/gi) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('unwrapStrayBoldShells drains empty <b></b> pairs and orphan </b><b> seams', () => {
    const input = '<div>hello<b></b>world</div></b><b><div>next</div></b>';
    const out = unwrapStrayBoldShells(input);
    expect(out).not.toMatch(/<b>\s*<\/b>/);
    expect(out).not.toMatch(/<\/b>\s*<b>/);
  });

  it('unwrapStrayBoldShells keeps content-carrying inline emphasis', () => {
    const input = '<p>가격은 <b>월 9,900원</b>부터 시작합니다.</p>';
    const out = unwrapStrayBoldShells(input);
    expect(out).toContain('<b>월 9,900원</b>');
  });

  it('collapseAdjacentDuplicateLabelDivs folds identical Space-Grotesk stat-label twins', () => {
    const input = [
      '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:24px;font-weight:700">HR 운영 시간 절감</div>',
      '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:24px;font-weight:700">HR 운영 시간 절감</div>',
      '<div>담당자 평균 월 47시간 → 18시간.</div>',
    ].join('');
    const out = collapseAdjacentDuplicateLabelDivs(input);
    expect((out.match(/HR 운영 시간 절감/g) ?? []).length).toBe(1);
    expect(out).toContain('담당자 평균 월 47시간');
  });

  it('collapseAdjacentDuplicateLabelDivs keeps siblings whose text differs', () => {
    const input = [
      '<div style="font-size:24px;font-weight:700">단원 1</div>',
      '<div style="font-size:24px;font-weight:700">단원 2</div>',
    ].join('');
    const out = collapseAdjacentDuplicateLabelDivs(input);
    expect(out).toBe(input);
  });

  it('salvageMalformedMiniMaxSlideMarkup end-to-end fixes all three defects from the fixture', () => {
    const salvaged = salvageMalformedMiniMaxSlideMarkup(FIXTURE_HTML, BRIEF);
    // 1) leading empty slot dropped
    const sectionCount = (salvaged.match(/<section[^>]*>/gi) ?? []).length;
    expect(sectionCount).toBe(3);
    expect(salvaged).not.toMatch(/<section\s+class="slide slide-title"[^>]*>[\s\S]*?<h1\s+style="text-align:center">\s*<\/h1>/);
    // 2) stray inline-bold shells (both around block content and between slides) are drained
    expect(salvaged).not.toMatch(/<b>\s*<\/b>/);
    expect(salvaged).not.toMatch(/<\/section>\s*<b>\s*<\/b>/);
    // 3) duplicate stat-labels collapsed on slide 5
    expect((salvaged.match(/HR 운영 시간 절감/g) ?? []).length).toBe(1);
    expect((salvaged.match(/동호회 참여율/g) ?? []).length).toBe(1);
    // Real content survives.
    expect(salvaged).toMatch(/CONTENT LIBRARY/);
    expect(salvaged).toMatch(/1,200\+개 문화 콘텐츠/);
    expect(salvaged).toMatch(/data-screen-label="01 Cover"/);
    expect(salvaged).toMatch(/data-screen-label="05 Impact"/);
    expect(salvaged).toMatch(/담당자 평균 월 47시간/);
    expect(salvaged).toMatch(/분기 평균 참여율 23%/);
  });

  it('salvage is idempotent — repeated salvage produces the same output', () => {
    const once = salvageMalformedMiniMaxSlideMarkup(FIXTURE_HTML, BRIEF);
    const twice = salvageMalformedMiniMaxSlideMarkup(once, BRIEF);
    expect(twice).toBe(once);
  });

  // 루프394-후속 — regression guard: restyleForeignIbMagazineCover(loop390)
  // creates a fresh .starfield host in the 8-bit orbit hero branch. Without
  // the inline `position:absolute;inset:0;pointer-events:none;` style,
  // restoreAtmosphericOverlayPositioning(loop392) re-styles it on a second
  // salvage pass and salvage stops being idempotent.
  it('restyleForeignIbMagazineCover emits an idempotent .starfield host on 8-bit orbit restyle', () => {
    const eightBitStub = `<!doctype html><html><head><style data-od-official-motif-deco-css>.slide [data-od-official-motif-html].pixel-particles{position:absolute;}</style></head><body>`
      + `<section class="slide cover" style="background:var(--paper);color:var(--ink)">`
      + `<header class="mast"><span class="brand">학습 노트</span></header>`
      + `<div class="body"><h1 class="display">팀버 소개</h1></div>`
      + `<footer class="foot"><span class="conf">팀버 소개</span></footer>`
      + `</section>`
      + `<section class="slide" data-screen-label="02"><div class="pixel-box" style="background:#0F1B3D;color:#F0A6CA">test</div></section>`
      + `<style data-od-official-look-css>:root{--neon-pink:#F0A6CA;--dark-void:#0A0E27;}.pixel-hero-text{color:var(--neon-cyan);}.pixel-box{background:var(--deep-navy);}</style>`
      + `</body></html>`;
    const restyled = restyleForeignIbMagazineCover(eightBitStub);
    // Newly-created starfield MUST carry the absolute+inset+pointer-none style
    // so restoreAtmosphericOverlayPositioning does not re-add it on pass 2.
    expect(restyled).toMatch(/<div class="starfield" aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;">/);
    // End-to-end idempotency proof through salvage.
    const salvOnce = salvageMalformedMiniMaxSlideMarkup(eightBitStub, 'test');
    const salvTwice = salvageMalformedMiniMaxSlideMarkup(salvOnce, 'test');
    expect(salvTwice).toBe(salvOnce);
  });
});
