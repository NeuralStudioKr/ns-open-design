/**
 * 루프345–350 · Process / Pricing / Roadmap / title-slide 잔여
 * (orphan flex-column grid, ul spill absorb, cross-grid list spill,
 *  orphan chrome card pull-back, inline chrome cardish repair, title center).
 */

import { describe, expect, it } from 'vitest';
import {
  absorbOrphanContentGridIntoFlexColumnHost,
  absorbSpilledBodyAcrossGridBoundary,
  absorbSpilledChromeCardSiblings,
  centerSparseTitleSlideHeading,
  healAiGeneratedDeckMarkup,
  pullOrphanChromeCardsIntoPrecedingGrid,
  repairUnbalancedCardDivsInFragment,
} from '../src/html/heal-ai-generated-deck.js';

const brief =
  'neuralstudio.kr 회사 사이트야. 분석해서 회사 소개 ppt 만들어줘.';

const whiteCard = 'background:#fff;border:2px solid #fff;padding:18px';
const chrome =
  'background:#008000;color:#fff;padding:22px 24px;border:2px solid #fff';

describe('루프349 · repairUnbalancedCardDivs inline chrome cards', () => {
  it('inserts sibling closes between consecutive inline chrome cards', () => {
    const inner = [
      '<div style="display:grid;grid-template-columns:repeat(2,1fr)">',
      `<div style="${whiteCard}"><div>01</div><div>Discovery</div></div>`,
      `<div style="${whiteCard}"><div>02</div><div>Design</div>`,
      '<div style="font-family:VT323">아키텍처·성능 목표</div>',
      '</div>',
      '</div>',
    ].join('');
    const out = repairUnbalancedCardDivsInFragment(inner);
    const designIdx = out.indexOf('Design');
    const archIdx = out.indexOf('아키텍처·성능 목표');
    expect(designIdx).toBeGreaterThan(-1);
    expect(archIdx).toBeGreaterThan(designIdx);
    expect(out.indexOf('</div>', designIdx)).toBeLessThan(archIdx);
  });
});

describe('루프345 · absorbOrphanContentGridIntoFlexColumnHost', () => {
  it('moves a flex:1 grid sibling back into the column host', () => {
    const html = [
      '<section class="slide" data-screen-label="08 Process">',
      '<div style="padding:48px 56px;flex:1;display:flex;flex-direction:column">',
      '<h2>8주 파일럿에서 양산까지의 5단계</h2>',
      '<div style="font-family:VT323">각 단계 종료 시 게이트 체크리스트</div>',
      '</div>',
      '<div style="display:grid;grid-template-columns:repeat(2, minmax(0,1fr));gap:16px;flex:1">',
      `<div style="${whiteCard}"><div>01</div><div>Discovery</div></div>`,
      `<div style="${whiteCard}"><div>02</div><div>Design</div>`,
      '<div style="font-family:VT323">아키텍처·성능 목표</div>',
      '</div>',
      '</div>',
      '</section>',
    ].join('');
    const out = absorbOrphanContentGridIntoFlexColumnHost(html, brief);
    const gateIdx = out.indexOf('게이트 체크리스트');
    const gridIdx = out.indexOf('display:grid');
    const discoveryIdx = out.indexOf('Discovery');
    expect(gridIdx).toBeGreaterThan(gateIdx);
    expect(discoveryIdx).toBeGreaterThan(gridIdx);
    expect(out.match(/display:grid/g)?.length).toBe(1);
  });
});

describe('루프346 · absorbSpilledChromeCardSiblings ul spill', () => {
  it('pulls a spilled ul after PLAN A back into the card', () => {
    const html = [
      '<div style="display:grid;grid-template-columns:repeat(2, minmax(0,1fr));gap:22px">',
      `<div style="${whiteCard}"><div>PLAN A</div><div>파일럿 (8주)</div></div>`,
      '<ul style="margin:0;padding-left:20px;font-family:VT323">',
      '<li>KPI 정의 + 프로토타입</li>',
      '<li>데이터·모델 1차 검증</li>',
      '</ul>',
      `<div style="${chrome}"><div>PLAN B ★ 추천</div></div>`,
      '</div>',
    ].join('');
    const out = absorbSpilledChromeCardSiblings(html, brief);
    const planAIdx = out.indexOf('PLAN A');
    const kpiIdx = out.indexOf('KPI 정의');
    const planBIdx = out.indexOf('PLAN B');
    expect(planAIdx).toBeLessThan(kpiIdx);
    expect(kpiIdx).toBeLessThan(planBIdx);
    expect(out.indexOf('</ul>', kpiIdx)).toBeLessThan(planBIdx);
  });
});

describe('루프347 · absorbSpilledBodyAcrossGridBoundary list spill', () => {
  it('pulls a ul sibling after a short last grid card into that card', () => {
    const html = [
      '<div style="padding:48px 56px">',
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px">',
      `<div style="${whiteCard}"><div>2025</div><div>기반 확립</div>`,
      '<ul><li>도메인별 LLM 라인업 6종 출시</li></ul></div>',
      `<div style="${whiteCard}"><div>2026</div><div>스케일업</div></div>`,
      '</div>',
      '<ul style="margin:0;padding-left:20px;font-family:VT323">',
      '<li>매니지드 ARR 비중 40%</li>',
      '<li>시리즈 A 라운드 추진</li>',
      '</ul>',
      '</div>',
    ].join('');
    const out = absorbSpilledBodyAcrossGridBoundary(html, brief);
    const scaleIdx = out.indexOf('스케일업');
    const arrIdx = out.indexOf('매니지드 ARR 비중 40%');
    const gridCloseIdx = out.indexOf('</div>', arrIdx);
    expect(scaleIdx).toBeLessThan(arrIdx);
    expect(gridCloseIdx).toBeGreaterThan(arrIdx);
    expect((out.match(/매니지드 ARR 비중 40%/g) ?? []).length).toBe(1);
  });
});

describe('루프348 · pullOrphanChromeCardsIntoPrecedingGrid', () => {
  it('pulls a chrome card orphan after the grid back into the grid', () => {
    const html = [
      '<div style="padding:48px 56px">',
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:22px">',
      `<div style="${whiteCard}"><div>2025</div><div>기반 확립</div></div>`,
      `<div style="${whiteCard}"><div>2026</div><div>스케일업</div></div>`,
      '</div>',
      `<div style="${whiteCard}"><div>2027</div><div>플랫폼화</div>`,
      '<ul><li>셀프서비스형 MLOps SaaS 출시</li></ul></div>',
      '</div>',
    ].join('');
    const out = pullOrphanChromeCardsIntoPrecedingGrid(html, brief);
    const gridOpenIdx = out.indexOf('display:grid');
    const y2027Idx = out.indexOf('2027');
    const gridCloseIdx = out.indexOf('</div>', y2027Idx);
    expect(y2027Idx).toBeGreaterThan(gridOpenIdx);
    expect(gridCloseIdx).toBeGreaterThan(y2027Idx);
    expect(out.indexOf('</div>', gridCloseIdx + 1)).toBeGreaterThan(gridCloseIdx);
  });
});

describe('루프350 · centerSparseTitleSlideHeading', () => {
  it('centers a lone h1 on slide-title covers via data-od-slide-flow', () => {
    const html = [
      '<section class="slide slide-title">',
      '<div data-od-slide-flow=""><h1>neuralstudio.kr 회사</h1></div>',
      '</section>',
    ].join('');
    const out = centerSparseTitleSlideHeading(html);
    expect(out).toMatch(/data-od-slide-flow[^>]*text-align\s*:\s*center/i);
    expect(out).toContain('<h1>neuralstudio.kr 회사</h1>');
    expect(out).not.toMatch(/<h1[^>]*text-align/i);
  });

  it('centers a lone h1 on leftover .cover hosts the same way', () => {
    const html = [
      '<section class="slide cover">',
      '<div data-od-slide-flow=""><h1 class="display">팀버 소개</h1></div>',
      '</section>',
    ].join('');
    const out = centerSparseTitleSlideHeading(html);
    expect(out).toMatch(/data-od-slide-flow[^>]*text-align\s*:\s*center/i);
    expect(out).toContain('팀버 소개');
  });

  it('leaves a title slide with a lede paragraph alone', () => {
    const html = [
      '<section class="slide slide-title">',
      '<h1>기업 소개</h1>',
      '<p>2026년 설립 · AI 컨설팅</p>',
      '</section>',
    ].join('');
    expect(centerSparseTitleSlideHeading(html)).toBe(html);
  });
});

describe('healAiGeneratedDeckMarkup · Process / Pricing / Roadmap + title 잔여', () => {
  it('repairs slide 08 / 09 / 10 + title slide in one pass', () => {
    const html = [
      '<section class="slide slide-title">',
      '<div data-od-slide-flow=""><h1>neuralstudio.kr 회사</h1></div>',
      '</section>',
      '<section class="slide" data-screen-label="08 Process">',
      '<div data-od-slide-flow><div class="win-window">',
      '<div style="padding:48px 56px;flex:1;display:flex;flex-direction:column">',
      '<h2>8주 파일럿에서 양산까지의 5단계</h2>',
      '<div style="font-family:VT323">각 단계 종료 시 게이트 체크리스트</div>',
      '</div>',
      '<div style="display:grid;grid-template-columns:repeat(2, minmax(0,1fr));gap:16px;flex:1">',
      `<div style="${whiteCard}"><div>01</div><div>Discovery</div></div>`,
      `<div style="${whiteCard}"><div>02</div><div>Design</div>`,
      '<div style="font-family:VT323">아키텍처·성능 목표</div>',
      '</div>',
      '</div>',
      '<div style="margin-top:22px;background:#000080;color:#fff;padding:14px 22px">',
      '▶ 모든 단계에서 주 1회 스테어링 코미티',
      '</div>',
      '</div></div></section>',
      '<section class="slide" data-screen-label="09 Pricing">',
      '<div style="padding:48px 56px;flex:1;display:flex;flex-direction:column">',
      '<h2>고객 상황에 맞는 3가지 협력 모델</h2>',
      '<div style="display:grid;grid-template-columns:repeat(2, minmax(0,1fr));gap:22px;flex:1">',
      `<div style="${whiteCard}"><div>PLAN A</div><div>파일럿 (8주)</div></div>`,
      '<ul style="margin:0;padding-left:20px;font-family:VT323">',
      '<li>KPI 정의 + 프로토타입</li><li>데이터·모델 1차 검증</li></ul>',
      `<div style="${chrome}"><div>PLAN B ★ 추천</div></div>`,
      '<div style="font-size:28px;font-weight:700">프로젝트 단위 구축</div>',
      '<div style="font-family:VT323;font-size:26px">8,000 ~ 수억원</div>',
      '</div></div></section>',
      '<section class="slide" data-screen-label="10 Roadmap">',
      '<div style="padding:48px 56px">',
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:22px">',
      `<div style="${whiteCard}"><div>2025</div><div>기반 확립</div>`,
      '<ul><li>도메인별 LLM 라인업 6종 출시</li></ul></div>',
      `<div style="${whiteCard}"><div>2026</div><div>스케일업</div></div>`,
      '</div>',
      '<ul style="margin:0;padding-left:20px;font-family:VT323">',
      '<li>매니지드 ARR 비중 40%</li><li>시리즈 A 라운드 추진</li></ul>',
      `<div style="${whiteCard}"><div>2027</div><div>플랫폼화</div>`,
      '<ul><li>셀프서비스형 MLOps SaaS 출시</li></ul></div>',
      '</div></section>',
    ].join('');
    const out = healAiGeneratedDeckMarkup(html, brief);
    expect(out).toMatch(/data-od-slide-flow[^>]*text-align\s*:\s*center/i);
    expect(out.indexOf('게이트 체크리스트')).toBeLessThan(out.indexOf('Discovery'));
    expect(out.indexOf('Design')).toBeLessThan(out.indexOf('아키텍처·성능 목표'));
    expect(out).toContain('▶ 모든 단계에서 주 1회 스테어링 코미티');
    expect(out.indexOf('PLAN A')).toBeLessThan(out.indexOf('KPI 정의'));
    expect(out.indexOf('PLAN B')).toBeLessThan(out.indexOf('프로젝트 단위 구축'));
    expect(out.indexOf('프로젝트 단위 구축')).toBeLessThan(out.indexOf('8,000 ~ 수억원'));
    expect(out.indexOf('스케일업')).toBeLessThan(out.indexOf('매니지드 ARR 비중 40%'));
    expect(out.indexOf('2027')).toBeGreaterThan(out.indexOf('display:grid'));
  });
});
