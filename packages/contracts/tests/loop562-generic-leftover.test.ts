import { describe, expect, it } from 'vitest';

import {
  healGenericTemplateCloneLeftover,
  salvageMalformedMiniMaxSlideMarkup,
  synthesizeTemplateCloneSlideBody,
} from '../src/template-clone-fill.js';

const LEFTOVER_TITLES = [
  '개요',
  '핵심 포인트',
  '탐색',
  '실행',
  '확장',
  '실무자',
  'Pricing',
  'Overview',
  '개요',
  '핵심 포인트',
];

function unnamedTenSlideDeck(): string {
  const slides = LEFTOVER_TITLES.map((title, index) => [
    `<section class="slide" data-slide="${index + 1}">`,
    `<h2>${title}</h2>`,
    `<p>핵심 맥락과 다음 단계</p>`,
    `<ul><li>탐색</li><li>실행</li><li>확장</li></ul>`,
    `</section>`,
  ].join('')).join('\n');
  return `<!doctype html><html><body>${slides}</body></html>`;
}

describe('0921-N02 generic leftover heal — kit key 없이', () => {
  it('synth leftover 개요 라벨은 개요/탐색 아웃라인을 넣지 않는다', () => {
    const unnamed = synthesizeTemplateCloneSlideBody('Teamver 소개', '개요', 2, 'Teamver 소개');
    expect(unnamed.lead).not.toMatch(/개요|핵심 포인트/);
    expect(unnamed.body).toMatch(/Teamver|보드/);
    expect(unnamed.items?.some((item) => item.title === '탐색')).toBeFalsy();
    const second = synthesizeTemplateCloneSlideBody('Teamver 소개', '핵심 포인트', 3, 'Teamver 소개');
    expect(second.lead).not.toBe(unnamed.lead);
    expect(second.lead).not.toMatch(/개요|파일럿/);
  });

  it('이름 없는 10장 leftover 덱을 persist heal하면 개요/탐색실행확장이 없고 제목이 서로 다르다', () => {
    const healed = healGenericTemplateCloneLeftover(unnamedTenSlideDeck(), 'Teamver 소개');
    expect(healed).not.toMatch(/(?<![가-힣])개요(?![가-힣])/);
    expect(healed).not.toMatch(/핵심\s*포인트/);
    expect(healed).not.toMatch(/탐색[\s\S]{0,80}실행[\s\S]{0,80}확장/);
    expect(healed).not.toMatch(/(?<![가-힣])실무자(?![가-힣])/);
    expect(healed).not.toMatch(/\bPricing\b|\bOverview\b/);
    const titles = [...healed.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)]
      .map((match) => String(match[1] ?? '').replace(/<[^>]+>/g, '').trim());
    expect(titles.length).toBe(10);
    expect(new Set(titles).size).toBeGreaterThanOrEqual(6);
    expect(healed).toMatch(/Teamver|보드|초안/);
  });

  it('salvage 공통 경로가 이름 없는 킷 leftover에도 적용된다', () => {
    const out = salvageMalformedMiniMaxSlideMarkup(unnamedTenSlideDeck(), 'Teamver 소개');
    expect(out).not.toMatch(/(?<![가-힣])개요(?![가-힣])/);
    expect(out).not.toMatch(/탐색[\s\S]{0,80}실행[\s\S]{0,80}확장/);
    expect(out).toMatch(/Teamver|보드/);
  });
});
