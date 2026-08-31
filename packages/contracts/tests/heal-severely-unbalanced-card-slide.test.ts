/**
 * 루프190 · Drop slides whose container tags are severely unbalanced.
 *
 * 사용자 리포트 2026-08-31 · 삼각함수 (loop186–189 후속):
 *   MiniMax fill 이 슬라이드 4 (`04 항등식`) · 슬라이드 5 (`05 그래프`) 의
 *   nested `<div class="card">` 를 열고 닫지 않음. 브라우저 파서는
 *   `</section>` 에서 강제로 나머지 `<div>` 를 닫아 이후 슬라이드가 이
 *   슬라이드에 삽입돼 카드 스타일을 상속받거나, srcdoc 파서에 따라
 *   레이아웃이 깨져 “카드가 세로 방향으로 무너진” 상태로 렌더된다.
 *
 * 안전한 shape-based 재봉합 (missing `</div>` 자동 삽입) 은 어렵다 —
 *   - card 뒤에 오는 형제 컨테이너 (`.grid`, `.split-left` 등) 를 잘못
 *     card 안으로 편입시킬 위험
 *   - `<style>` 안의 문자열 (`content:"</div>"`) 을 close 로 오인
 *
 * 대신 슬라이드 단위 detect + drop:
 *   - 한 슬라이드 안 `<div\b` open 이 `</div>` close 를 `≥ 3` 초과
 *   - 스타일/스크립트 등 잡음이 아닌 컨테이너 태그만 계수
 *   - 첫 슬라이드는 절대 drop 안 함 (cover 만이라도 유지)
 *   - Idempotent · 다른 heal 룰 (title-only intro drop 등) 과 순서 무관
 *
 * 후속 (루프194):
 *   - 형제 `.card` / `.chart-card` 미닫힘은 `closeUnclosedSiblingCardsInSlides`
 *     가 close 태그만 삽입해 살림 (카피 발명 없음). severe drop 은
 *     cardish가 아닌 깊은 래퍼 불균형 안전망으로 남음.
 *   - persist-level short-draft gate 는 이 drop 이후 남은 슬라이드 수를
 *     본다 — 모든 non-first 슬라이드가 imbalanced 면 3 장 이하로 남고
 *     루프188 `deckLooksLikeTitleOnlyOutlineShell` 이후 short-draft 로
 *     차단될 수 있음. 그 축은 루프188 이 이미 담당.
 */

import { describe, expect, it } from 'vitest';
import {
  dropSlidesWithSeverelyUnbalancedContainerTags,
  healAiGeneratedDeckMarkup,
} from '../src/html/heal-ai-generated-deck.js';

const balancedCoverSlide = [
  '<section class="slide" data-screen-label="01 Cover">',
  '<div data-od-slide-flow="">',
  '<div class="cover-bg"></div>',
  '<h1>삼각함수의 언어와 형상</h1>',
  '<p>직각삼각형의 변 길이 비에서 시작해, 단위원 위의 회전과 파동으로 확장…</p>',
  '</div>',
  '</section>',
].join('');

const balancedDefinitionSlide = [
  '<section class="slide" data-screen-label="03 정의">',
  '<div data-od-slide-flow="">',
  '<h2>삼각비의 정의</h2>',
  '<div class="cards-grid">',
  '<div class="card"><h3>sin</h3><p>맞변 ÷ 빗변</p></div>',
  '<div class="card"><h3>cos</h3><p>밑변 ÷ 빗변</p></div>',
  '<div class="card"><h3>tan</h3><p>맞변 ÷ 밑변</p></div>',
  '</div>',
  '</div>',
  '</section>',
].join('');

// 슬라이드 4 (04 항등식) — 4 unclosed inner `<div>` (opens 6, closes 2 → diff 4).
// MiniMax card fill 이 header/body 를 nested 시켰지만 close 를 못 붙인 케이스.
const imbalancedIdentitySlide = [
  '<section class="slide" data-screen-label="04 항등식">',
  '<div data-od-slide-flow="">',
  '<h2>주요 삼각함수 항등식</h2>',
  '<div class="cards-grid">',
  '<div class="card"><div class="card-body"><h3>피타고라스</h3><p>sin²θ + cos²θ = 1</p>',
  '<div class="card"><div class="card-body"><h3>덧셈 정리</h3><p>sin(a+b) = sin a·cos b + cos a·sin b</p>',
  '<div class="card"><div class="card-body"><h3>이중각</h3><p>sin 2θ = 2 sin θ·cos θ</p>',
  '</div>',
  '</section>',
].join('');

// 슬라이드 5 (05 그래프) — 3 unclosed (opens 5, closes 2 → diff 3).
const imbalancedGraphSlide = [
  '<section class="slide" data-screen-label="05 그래프">',
  '<div data-od-slide-flow="">',
  '<h2>사인·코사인·탄젠트 그래프</h2>',
  '<div class="chart-grid">',
  '<div class="chart-card"><h3>sin θ</h3><p>주기 2π · 진폭 1</p>',
  '<div class="chart-card"><h3>cos θ</h3><p>주기 2π · 진폭 1</p>',
  '<div class="chart-card"><h3>tan θ</h3><p>주기 π · 점근선 π/2 + nπ</p>',
  '</div>',
  '</section>',
].join('');

const USER_DECK_WITH_IMBALANCED_CARDS = [
  '<!doctype html><html lang="ko"><body class="tpl-pitch-deck">',
  balancedCoverSlide,
  balancedDefinitionSlide,
  imbalancedIdentitySlide,
  imbalancedGraphSlide,
  '</body></html>',
].join('\n');

const USER_BRIEF = '삼각함수에 대해서 설명하는 피피티 만들어줘.';

function countSlides(html: string): number {
  return (
    html.match(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi) ?? []
  ).length;
}

describe('루프190/194 · dropSlidesWithSeverelyUnbalancedContainerTags', () => {
  it('drops slides with (opens − closes) ≥ 2 while keeping balanced slides', () => {
    const before = countSlides(USER_DECK_WITH_IMBALANCED_CARDS);
    expect(before).toBe(4);

    const out = dropSlidesWithSeverelyUnbalancedContainerTags(
      USER_DECK_WITH_IMBALANCED_CARDS,
    );
    // 4 개 슬라이드 중 뒤 2 개가 imbalanced → 2 개 슬라이드만 남음
    expect(countSlides(out)).toBe(2);
    expect(out).toContain('data-screen-label="01 Cover"');
    expect(out).toContain('data-screen-label="03 정의"');
    expect(out).not.toContain('data-screen-label="04 항등식"');
    expect(out).not.toContain('data-screen-label="05 그래프"');
  });

  it('drops a card + card-body pair that never closed (diff 2)', () => {
    const pair = [
      '<!doctype html><html><body>',
      balancedCoverSlide,
      '<section class="slide" data-screen-label="pair">',
      '<div class="card"><div class="card-body"><h3>피타고라스</h3><p>sin²θ + cos²θ = 1</p>',
      '</section>',
      '</body></html>',
    ].join('\n');
    const out = dropSlidesWithSeverelyUnbalancedContainerTags(pair);
    expect(countSlides(out)).toBe(1);
    expect(out).toContain('data-screen-label="01 Cover"');
    expect(out).not.toContain('data-screen-label="pair"');
  });

  it('drops unclosed article/aside pairs the same way as div cards', () => {
    const articles = [
      '<!doctype html><html><body>',
      balancedCoverSlide,
      '<section class="slide" data-screen-label="articles">',
      '<article><article><h2>그래프</h2><p>주기와 진폭.</p>',
      '</section>',
      '</body></html>',
    ].join('\n');
    const out = dropSlidesWithSeverelyUnbalancedContainerTags(articles);
    expect(countSlides(out)).toBe(1);
    expect(out).not.toContain('data-screen-label="articles"');
  });

  it('never drops the first slide even if it is severely unbalanced', () => {
    const firstUnbalanced = [
      '<!doctype html><html lang="ko"><body>',
      // First slide has diff 4 but MUST survive so a broken deck never renders empty.
      '<section class="slide" data-screen-label="01 Cover">',
      '<div><div><div><div><h1>삼각함수</h1></div>',
      '</section>',
      balancedDefinitionSlide,
      '</body></html>',
    ].join('\n');
    const out = dropSlidesWithSeverelyUnbalancedContainerTags(firstUnbalanced);
    expect(countSlides(out)).toBe(2);
    expect(out).toContain('data-screen-label="01 Cover"');
  });

  it('keeps mildly unbalanced slides (diff 1 stays)', () => {
    const mild = [
      '<!doctype html><html><body>',
      balancedCoverSlide,
      // opens 3, closes 2 → diff 1. Safe: single unclosed card can be
      // silently repaired by the browser without cross-slide bleed.
      '<section class="slide" data-screen-label="mild">',
      '<div data-od-slide-flow="">',
      '<div class="card"><h3>A</h3><p>a</p>',
      '<div class="card"><h3>B</h3><p>b</p></div>',
      '</div>',
      '</section>',
      '</body></html>',
    ].join('\n');
    const out = dropSlidesWithSeverelyUnbalancedContainerTags(mild);
    expect(countSlides(out)).toBe(2);
    expect(out).toContain('data-screen-label="mild"');
  });

  it('does not count `<div>` tokens that live inside <style> or <script>', () => {
    // MiniMax pin CSS sometimes ships `content:"</div>"` counters. Those
    // must not fool the balance check.
    const withStyle = [
      '<!doctype html><html><body>',
      balancedCoverSlide,
      '<section class="slide" data-screen-label="style-noise">',
      '<style>.card::before{content:"<div>"}',
      '.card::after{content:"</div></div></div>"}</style>',
      '<div data-od-slide-flow="">',
      '<div class="card"><h3>A</h3><p>a</p></div>',
      '<div class="card"><h3>B</h3><p>b</p></div>',
      '</div>',
      '</section>',
      '</body></html>',
    ].join('\n');
    const out = dropSlidesWithSeverelyUnbalancedContainerTags(withStyle);
    // Style tokens are stripped before counting — this slide is actually
    // balanced. Should not be dropped.
    expect(countSlides(out)).toBe(2);
    expect(out).toContain('data-screen-label="style-noise"');
  });

  it('is idempotent — a second pass yields the same result', () => {
    const once = dropSlidesWithSeverelyUnbalancedContainerTags(
      USER_DECK_WITH_IMBALANCED_CARDS,
    );
    const twice = dropSlidesWithSeverelyUnbalancedContainerTags(once);
    expect(twice).toBe(once);
  });

  it('leaves already-clean decks untouched', () => {
    const clean = [
      '<!doctype html><html><body>',
      balancedCoverSlide,
      balancedDefinitionSlide,
      '</body></html>',
    ].join('\n');
    expect(dropSlidesWithSeverelyUnbalancedContainerTags(clean)).toBe(clean);
  });
});

describe('루프190/194 · healAiGeneratedDeckMarkup pipeline integration', () => {
  it('repairs cardish sibling imbalance before severe drop (루프194)', () => {
    // 루프190b drop alone would remove slides 04/05 (diff ≥ 3).
    // 루프194 closes nested unclosed .card / .chart-card siblings first,
    // so the trigonometric identity/graph slides survive with their copy.
    const out = healAiGeneratedDeckMarkup(
      USER_DECK_WITH_IMBALANCED_CARDS,
      USER_BRIEF,
    );
    expect(countSlides(out)).toBe(4);
    expect(out).toContain('data-screen-label="01 Cover"');
    expect(out).toContain('data-screen-label="03 정의"');
    expect(out).toContain('data-screen-label="04 항등식"');
    expect(out).toContain('data-screen-label="05 그래프"');
    expect(out).toContain('맞변 ÷ 빗변');
    expect(out).toContain('피타고라스');
    expect(out).toContain('sin θ');
    // Sibling cards are closed before the next peer opens.
    expect(out).toMatch(/피타고라스[\s\S]*?<\/div>\s*<div class="card"/);
    expect(out).toMatch(/sin θ[\s\S]*?<\/div>\s*<div class="chart-card"/);
  });

  it('closes leftover non-cardish wrappers at slide end so 190b need not drop', () => {
    // End-of-fragment close tags (루프194) balance plain nested <div>s inside
    // the slide host. 190b drop stays as a residual safety net only.
    const nested = [
      '<!doctype html><html><body>',
      balancedCoverSlide,
      '<section class="slide" data-screen-label="bad-nest">',
      '<div data-od-slide-flow="">',
      '<h2>깨진 래퍼</h2>',
      '<div><div><div><div><p>본문</p>',
      '</div>',
      '</section>',
      balancedDefinitionSlide,
      '</body></html>',
    ].join('\n');
    const out = healAiGeneratedDeckMarkup(nested, USER_BRIEF);
    expect(out).toContain('data-screen-label="01 Cover"');
    expect(out).toContain('data-screen-label="bad-nest"');
    expect(out).toContain('깨진 래퍼');
    expect(out).toContain('본문');
    expect(out).toContain('data-screen-label="03 정의"');
    const nest = /data-screen-label="bad-nest"[\s\S]*?<\/section>/.exec(out)?.[0] ?? '';
    const opens = (nest.match(/<div\b/gi) ?? []).length;
    const closes = (nest.match(/<\/div>/gi) ?? []).length;
    expect(opens).toBe(closes);
  });

  it('does not remove any balanced slides that flow through the full pipeline', () => {
    // A fully balanced deck must survive loop190 (no imbalanced slides).
    // The exact drop count from other heal rules (loop186 title-only intro
    // drop, loop182 duplicate collapse …) is pinned by their own fixtures.
    const balanced = [
      '<!doctype html><html><body>',
      balancedCoverSlide,
      balancedDefinitionSlide,
      '</body></html>',
    ].join('\n');
    const out = healAiGeneratedDeckMarkup(balanced, USER_BRIEF);
    expect(countSlides(out)).toBeGreaterThanOrEqual(2);
    expect(out).toContain('data-screen-label="01 Cover"');
    expect(out).toContain('data-screen-label="03 정의"');
  });
});
