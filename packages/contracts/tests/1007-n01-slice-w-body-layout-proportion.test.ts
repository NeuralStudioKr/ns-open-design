import { describe, expect, it } from 'vitest';

import {
  healAiGeneratedDeckMarkup,
  htmlNeedsSparseSixteenNineFill,
  injectSparseG2FillCss,
  SPARSE_SIXTEEN_NINE_FILL_CSS,
} from '../src/index.js';

const CONSULTING = 'AI Strategy Consulting';
const LLM = 'Custom LLM Development';
const AGENT = 'AI Agent Automation';
const BUILD_TITLE = 'What We Build';
const BUILD_KICKER = '02 // SERVICES';
const CONSULTING_BODY =
  '비즈니스 현장부터 AI 도입 로드맵, ROI 검증까지, 경영진 의사결정을 위한 실행 가능한 전략을 설계합니다.';
const LLM_BODY =
  '도메인 특화 파이프라인, RAG 파이프라인, 멀티모달 모델 통합. 사내 데이터로 학습한 전용 LLM을 구축합니다.';
const AGENT_BODY =
  '반복 업무를 대체하는 자율 에이전트 설계. 워크플로우 자동화로 운영 비용을 평균 40% 절감합니다.';

const WORK_TITLE = 'How We Work';
const WORK_KICKER = '05 // WORKFLOW';
const WORK_LEDE = '4단계 반복 사이클로 빠른 검증과 지속 개선을 동시에 추구합니다.';
const STEP1 = 'STEP 01';
const STEP2 = 'STEP 02';
const STEP3 = 'STEP 03';
const STEP4 = 'STEP 04';
const DISCOVERY = 'Discovery';
const PROTOTYPE = 'Prototype';
const DEPLOY = 'Deploy';
const CONTINUE = 'Continue';

const COVER_TITLE = '독자를 사로잡는 한 문장';

function screenshotAInvertedServices(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${BUILD_TITLE}</title></head>`,
    '<body class="tpl-product-launch">',
    '<section class="slide dark"><div data-od-slide-flow>',
    `<p class="kicker">${BUILD_KICKER}</p>`,
    '<div class="grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
    `<div class="card"><h3>${CONSULTING}</h3><p>${CONSULTING_BODY}</p></div>`,
    `<div class="card"><h3>${LLM}</h3><p>${LLM_BODY}</p></div>`,
    `<div class="card"><h3>${AGENT}</h3><p>${AGENT_BODY}</p></div>`,
    '</div>',
    `<h1>${BUILD_TITLE}</h1>`,
    '<div class="card"></div>',
    '</div></section></body></html>',
  ].join('');
}

function screenshotBOverlappingTimeline(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${WORK_TITLE}</title></head>`,
    '<body class="tpl-product-launch">',
    '<section class="slide dark"><div data-od-slide-flow>',
    `<p class="kicker">${WORK_KICKER}</p>`,
    `<h2>${WORK_TITLE}</h2>`,
    `<p class="lede">${WORK_LEDE}</p>`,
    '<div class="timeline" style="position:relative;height:920px">',
    `<div class="step" style="position:absolute;top:40px;left:0;width:42%;height:160px;background:#2ee">${STEP1} ${DISCOVERY}</div>`,
    `<div class="step" style="position:absolute;top:90px;left:28%;width:48%;height:160px;background:#f8a">${STEP2} ${PROTOTYPE}</div>`,
    `<div class="step" style="position:absolute;top:280px;left:0;width:100%;height:120px;background:#fc3">${STEP3} ${DEPLOY}</div>`,
    `<div class="step" style="position:absolute;top:860px;left:0;width:100%;height:140px">${STEP4} ${CONTINUE}</div>`,
    '</div>',
    '</div></section></body></html>',
  ].join('');
}

function nonOverlappingHorizontalSteps(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${WORK_TITLE}</title></head>`,
    '<body class="tpl-product-launch">',
    '<section class="slide dark"><div data-od-slide-flow>',
    `<p class="kicker">${WORK_KICKER}</p>`,
    `<h2>${WORK_TITLE}</h2>`,
    `<p class="lede">${WORK_LEDE}</p>`,
    '<div class="timeline" style="display:flex;flex-direction:row;gap:16px">',
    `<div class="step">${STEP1} ${DISCOVERY}</div>`,
    `<div class="step">${STEP2} ${PROTOTYPE}</div>`,
    `<div class="step">${STEP3} ${DEPLOY}</div>`,
    `<div class="step">${STEP4} ${CONTINUE}</div>`,
    '</div>',
    '</div></section></body></html>',
  ].join('');
}

function invertedServicesWithTrailingLede(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${BUILD_TITLE}</title></head>`,
    '<body class="tpl-product-launch">',
    '<section class="slide dark"><div data-od-slide-flow>',
    '<div class="grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
    `<div class="card"><h3>${CONSULTING}</h3><p>${CONSULTING_BODY}</p></div>`,
    `<div class="card"><h3>${LLM}</h3><p>${LLM_BODY}</p></div>`,
    `<div class="card"><h3>${AGENT}</h3><p>${AGENT_BODY}</p></div>`,
    '</div>',
    `<h1>${BUILD_TITLE}</h1>`,
    `<p class="lede">${WORK_LEDE}</p>`,
    '</div></section></body></html>',
  ].join('');
}

function coverTitlewrapDeck(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${COVER_TITLE}</title>`,
    '<style data-od-official-look-css>.s-cover .titlewrap{bottom:80px}</style></head>',
    '<body class="tpl-product-launch">',
    '<section class="slide s-cover"><div data-od-slide-flow>',
    `<div class="titlewrap"><h1 class="title">${COVER_TITLE}</h1></div>`,
    '</div></section>',
    '<section class="slide dark"><div data-od-slide-flow>',
    `<h2>${BUILD_TITLE}</h2>`,
    `<div class="grid g3"><div class="card"><h3>${CONSULTING}</h3><p>${CONSULTING_BODY}</p></div></div>`,
    '</div></section>',
    '</body></html>',
  ].join('');
}

function headingIndex(html: string, title: string): number {
  const match = new RegExp(`<h[1-3][^>]*>${title}</h[1-3]>`, 'i').exec(html);
  return match?.index ?? -1;
}

function expectNoSyntheticCopy(html: string) {
  expect(html).not.toMatch(/에 대한/);
  expect(html).not.toContain('개념');
  expect(html).not.toContain('구조');
  expect(html).not.toContain('영향');
  expect(html).not.toMatch(/임의의|지금 다뤄야|핵심 질문/);
}

describe('1007-N01 슬라이스 W — CSS 범위', () => {
  it('title-then-cluster 센티널과 스텝 스택 규칙을 싣고 L g2/quote 셀렉터는 유지한다', () => {
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('od-title-then-cluster');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('od-body-fill-cluster');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('od-step-track-stack');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('body.tpl-product-launch');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain(':not(.s-cover)');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('.grid.g2>*');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain(':not(:has(ul))');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('min-height:clamp(240px,36%,420px)');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('.grid:not(.g2)>*');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('.od-body-fill-cluster .card');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).not.toContain('.od-body-fill-cluster>*{');
  });
});

describe('1007-N01 슬라이스 W — 스크린샷 A inverted services', () => {
  it('제목을 카드 앞으로 옮기고 well 클러스터로 감싸며 카드 문장·빈 박스를 유지/strip 한다', () => {
    const source = screenshotAInvertedServices();
    expect(headingIndex(source, BUILD_TITLE)).toBeGreaterThan(source.indexOf(CONSULTING));
    expect(source).toMatch(/<div class="card"><\/div>/);
    const healed = healAiGeneratedDeckMarkup(source, BUILD_TITLE);
    expect(headingIndex(healed, BUILD_TITLE)).toBeGreaterThan(-1);
    expect(headingIndex(healed, BUILD_TITLE)).toBeLessThan(healed.indexOf(CONSULTING));
    expect(healed.indexOf(BUILD_KICKER)).toBeLessThan(headingIndex(healed, BUILD_TITLE));
    expect(healed).toContain('od-body-fill-cluster');
    expect(healed).toContain('od-title-then-cluster');
    expect(healed).toContain(CONSULTING);
    expect(healed).toContain(LLM);
    expect(healed).toContain(AGENT);
    expect(healed).toContain(CONSULTING_BODY);
    expect(healed).toContain(LLM_BODY);
    expect(healed).toContain(AGENT_BODY);
    expect(healed).not.toMatch(/<div class="card"><\/div>/);
    expect(healed).not.toContain('hero-shot');
    expectNoSyntheticCopy(healed);
  });
});

describe('1007-N01 슬라이스 W — 스크린샷 B overlapping timeline', () => {
  it('4스텝을 겹침 없이 스택하고 원문 라벨을 유지한다', () => {
    const source = screenshotBOverlappingTimeline();
    expect(htmlNeedsSparseSixteenNineFill(source)).toBe(true);
    const healed = healAiGeneratedDeckMarkup(source, WORK_TITLE);
    expect(healed).toContain('od-step-track-stack');
    expect(healed).toContain('od-title-then-cluster');
    expect(headingIndex(healed, WORK_TITLE)).toBeLessThan(healed.indexOf(STEP1));
    expect(healed).toContain(WORK_KICKER);
    expect(healed).toContain(WORK_LEDE);
    expect(healed).toContain(STEP1);
    expect(healed).toContain(STEP2);
    expect(healed).toContain(STEP3);
    expect(healed).toContain(STEP4);
    expect(healed).toContain(DISCOVERY);
    expect(healed).toContain(PROTOTYPE);
    expect(healed).toContain(DEPLOY);
    expect(healed).toContain(CONTINUE);
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('position:relative!important');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('max-height:min(160px,22%)');
    expectNoSyntheticCopy(healed);
  });

  it('겹치지 않는 가로 4스텝은 스택 클래스를 붙이지 않는다', () => {
    const source = nonOverlappingHorizontalSteps();
    const healed = healAiGeneratedDeckMarkup(source, WORK_TITLE);
    const body = healed.slice(healed.indexOf('<body'));
    expect(body).toContain('od-body-fill-cluster');
    expect(body).not.toContain('od-step-track-stack');
    expect(body).toContain(STEP1);
    expect(body).toContain(STEP4);
    expect(body).toContain(DISCOVERY);
    expect(body).toContain(CONTINUE);
    expect(body).toContain('flex-direction:row');
    expectNoSyntheticCopy(healed);
  });

  it('absolute 없는 탑레벨 스텝 형제도 스택하지 않는다', () => {
    const source = [
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
      `<title>${WORK_TITLE}</title></head>`,
      '<body class="tpl-product-launch">',
      '<section class="slide dark"><div data-od-slide-flow>',
      `<h2>${WORK_TITLE}</h2>`,
      `<div class="step">${STEP1} ${DISCOVERY}</div>`,
      `<div class="step">${STEP2} ${PROTOTYPE}</div>`,
      `<div class="step">${STEP3} ${DEPLOY}</div>`,
      `<div class="step">${STEP4} ${CONTINUE}</div>`,
      '</div></section></body></html>',
    ].join('');
    const healed = healAiGeneratedDeckMarkup(source, WORK_TITLE);
    const body = healed.slice(healed.indexOf('<body'));
    expect(body).toContain('od-body-fill-cluster');
    expect(body).not.toContain('od-step-track-stack');
    expect(body).toContain(STEP4);
    expectNoSyntheticCopy(healed);
  });
});

describe('1007-N01 슬라이스 W — 제목 뒤 리드도 클러스터 앞으로', () => {
  it('뒤집힌 그리드 + H1 + lede 는 리드를 카드 앞에 붙인다', () => {
    const source = invertedServicesWithTrailingLede();
    const healed = healAiGeneratedDeckMarkup(source, BUILD_TITLE);
    const titleAt = headingIndex(healed, BUILD_TITLE);
    const ledeAt = healed.indexOf(WORK_LEDE);
    const cardAt = healed.indexOf(CONSULTING);
    expect(titleAt).toBeGreaterThan(-1);
    expect(ledeAt).toBeGreaterThan(titleAt);
    expect(ledeAt).toBeLessThan(cardAt);
    expect(healed).toContain(CONSULTING_BODY);
    expectNoSyntheticCopy(healed);
  });
});

describe('1007-N01 슬라이스 W — I/S 커버·L 시트 refresh', () => {
  it('s-cover titlewrap 은 옮기지 않고 킷 absolute 규칙을 유지한다', () => {
    const healed = healAiGeneratedDeckMarkup(coverTitlewrapDeck(), COVER_TITLE);
    expect(healed).toMatch(/s-cover[\s\S]*titlewrap[\s\S]*What We Build/);
    const coverChunk = healed.slice(
      healed.indexOf('s-cover'),
      healed.indexOf('What We Build'),
    );
    expect(coverChunk).toContain('titlewrap');
    expect(healed).toContain('data-od-s-cover-kit-slots');
    expect(healed).toMatch(/\.slide\.s-cover\s+\.titlewrap\{[^}]*position\s*:\s*absolute/i);
    expect(healed).toContain(COVER_TITLE);
    expect(healed).toContain(CONSULTING_BODY);
  });

  it('이미 있는 L 시트를 W 규칙으로 refresh 한다', () => {
    const stale = [
      screenshotAInvertedServices().replace(
        '</head>',
        '<style data-od-sparse-g2-fill>/* od-sparse-16x9-fill (1007-N01 K/L) */.grid.g2{flex:1}</style></head>',
      ),
    ][0]!;
    expect(stale).toContain('data-od-sparse-g2-fill');
    expect(stale).not.toContain('od-title-then-cluster');
    const refreshed = injectSparseG2FillCss(stale);
    expect(refreshed).toContain('od-title-then-cluster');
    expect(refreshed).toContain('.grid.g2>*');
    expect((refreshed.match(/data-od-sparse-g2-fill/g) ?? []).length).toBe(1);
  });
});
