import { describe, expect, it } from 'vitest';

import {
  HEADING_COUNT_RECONCILED_ATTR,
  HEADING_COUNT_SHORTFALL_ATTR,
  findDeckSparseContentEvidence,
  reconcileHeadingItemCounts,
} from '../src/html/heal-heading-item-count.js';

const card = (title: string, body: string): string =>
  `<div style="padding:32px"><p style="font-weight:700">${title}</p>`
  + (body ? `<p>${body}</p>` : '')
  + '</div>';

const slide = (heading: string, cards: string[]): string =>
  '<section class="slide" data-screen-label="03 주요 기능">'
  + `<h2 style="font:800 60px/1.1 sans-serif">${heading}</h2>`
  + '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px">'
  + cards.join('')
  + '</div></section>';

describe('루프480 heading ↔ item count reconciliation', () => {
  it('renumbers a heading that promises more cards than the slide renders', () => {
    const html = slide('4가지 핵심 기능', [
      card('스마트 워크스페이스', '프로젝트·채널·문서를 자동 분류합니다.'),
      card('AI 미팅 어시스턴트', '회의를 실시간으로 기록합니다.'),
      card('통합 인사이트 대시보드', '병목 구간을 추적합니다.'),
    ]);
    const healed = reconcileHeadingItemCounts(html);
    expect(healed).toContain('3가지 핵심 기능');
    expect(healed).not.toContain('4가지 핵심 기능');
    expect(healed).toContain(`${HEADING_COUNT_RECONCILED_ATTR}="4:3"`);
  });

  it('renumbers Hangul word numerals in place', () => {
    const html = slide('네 가지 원칙', [
      card('원칙 1', '본문이 있습니다.'),
      card('원칙 2', '본문이 있습니다.'),
    ]);
    expect(reconcileHeadingItemCounts(html)).toContain('두 가지 원칙');
  });

  it('leaves a heading whose promise matches the rendered cards', () => {
    const html = slide('3가지 핵심 기능', [
      card('A', '본문이 있습니다.'),
      card('B', '본문이 있습니다.'),
      card('C', '본문이 있습니다.'),
    ]);
    expect(reconcileHeadingItemCounts(html)).toBe(html);
  });

  it('never grows a heading when the slide renders more cards', () => {
    const html = slide('2가지 핵심 기능', [
      card('A', '본문이 있습니다.'),
      card('B', '본문이 있습니다.'),
      card('C', '본문이 있습니다.'),
    ]);
    expect(reconcileHeadingItemCounts(html)).toBe(html);
  });

  it('ignores numbers that are not item counters', () => {
    const html = slide('2024년 성과 요약', [
      card('A', '본문이 있습니다.'),
      card('B', '본문이 있습니다.'),
    ]);
    expect(reconcileHeadingItemCounts(html)).toBe(html);
  });

  it('keeps the copy when the heading itself lists the promised items', () => {
    const html = slide('미적분의 세 기둥: 극한 · 도함수 · 적분', [
      card('PILLAR 01', '극한을 다룹니다.'),
      card('PILLAR 02', '도함수를 다룹니다.'),
    ]);
    const healed = reconcileHeadingItemCounts(html);
    expect(healed).toContain('미적분의 세 기둥');
    expect(healed).not.toContain('미적분의 두 기둥');
    expect(healed).toContain(`${HEADING_COUNT_SHORTFALL_ATTR}="3:2"`);
    // Still reported, so the top-up turn writes the missing pillar.
    expect(findDeckSparseContentEvidence(healed).map((item) => item.reason))
      .toContain('heading_count_shortfall');
  });

  it('is idempotent', () => {
    const html = slide('4가지 핵심 기능', [
      card('A', '본문이 있습니다.'),
      card('B', '본문이 있습니다.'),
      card('C', '본문이 있습니다.'),
    ]);
    const once = reconcileHeadingItemCounts(html);
    expect(reconcileHeadingItemCounts(once)).toBe(once);
  });
});

describe('루프480 sparse content evidence', () => {
  it('reports a reconciled heading as a shortfall', () => {
    const healed = reconcileHeadingItemCounts(slide('4가지 핵심 기능', [
      card('A', '본문이 있습니다.'),
      card('B', '본문이 있습니다.'),
      card('C', '본문이 있습니다.'),
    ]));
    const evidence = findDeckSparseContentEvidence(healed);
    expect(evidence.map((item) => item.reason)).toContain('heading_count_shortfall');
  });

  it('reports a pricing tier whose body never arrived', () => {
    const html = '<section class="slide"><h2>맞춤 요금제</h2>'
      + '<div style="display:flex;gap:24px">'
      + card('Free', '최대 5명 · 핵심 협업 기능')
      + card('Pro', '')
      + card('Enterprise', 'SSO')
      + '</div></section>';
    const evidence = findDeckSparseContentEvidence(html);
    expect(evidence.map((item) => item.reason)).toContain('title_only_card');
  });

  it('stays quiet on a complete deck', () => {
    const html = slide('3가지 핵심 기능', [
      card('A', '충분한 본문이 있습니다.'),
      card('B', '충분한 본문이 있습니다.'),
      card('C', '충분한 본문이 있습니다.'),
    ]);
    expect(findDeckSparseContentEvidence(html)).toEqual([]);
  });
});
