/**
 * 루프331–335 · MiniMax neuralstudio.kr 회사소개 잔여
 * (heading tail dup, cross-grid spilled body, orphan <b>tail</b>,
 *  empty-body chrome-card grids, HTML void element depth stabilization).
 */

import { describe, expect, it } from 'vitest';
import {
  absorbSpilledBodyAcrossGridBoundary,
  dropChromeCardGridsWithAllEmptyBodies,
  dropUnfilledChromeCardPeersInAllocatedRows,
  healAiGeneratedDeckMarkup,
  stripDuplicatedHeadingTailAfterClose,
  stripDuplicatedInlineTailAfterSiblingClose,
} from '../src/html/heal-ai-generated-deck.js';

const brief =
  'neuralstudio.kr 회사 사이트야. 분석해서 회사 소개 ppt 만들어줘.';

const chrome =
  'background:#008000;color:#fff;padding:22px 24px;border:2px solid #fff';

describe('루프331 · stripDuplicatedHeadingTailAfterClose', () => {
  it('strips the trailing suffix repeated after </h2>', () => {
    const html = [
      '<section class="slide" data-screen-label="07 Close">',
      '<h2 style="font-size:64px">신뢰할 수 있는 AI 파트너,<br>neuralstudio.kr</h2>',
      ' AI 파트너,<br>neuralstudio.kr ',
      '<div style="font-family:VT323;font-size:26px">파일럿 1건부터 시작합니다.</div>',
      '</section>',
    ].join('');
    const out = stripDuplicatedHeadingTailAfterClose(html);
    expect(
      (out.match(/AI 파트너/g) ?? []).length,
    ).toBe(1);
    expect(out).toContain('파일럿 1건부터 시작합니다.');
  });

  it('leaves a normal heading + lede alone', () => {
    const html = [
      '<h2>기업 소개</h2>',
      '<div>파일럿 1건부터 시작합니다.</div>',
    ].join('');
    expect(stripDuplicatedHeadingTailAfterClose(html)).toBe(html);
  });

  it('leaves a short repeated fragment alone (< 4 chars)', () => {
    const html = '<h2>ABC</h2> ABC <div>본문</div>';
    expect(stripDuplicatedHeadingTailAfterClose(html)).toBe(html);
  });
});

describe('루프332 · absorbSpilledBodyAcrossGridBoundary', () => {
  it('pulls a bare text sibling after the grid into the last short chrome card', () => {
    const html = [
      '<section class="slide" data-screen-label="07 Close">',
      '<div style="padding:48px 56px">',
      '<h2>다음 단계</h2>',
      '<div style="display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:20px">',
      `<div style="${chrome}"><div>STEP 01</div><div>무료 진단</div><div>데이터 점검</div></div>`,
      `<div style="${chrome}"><div>STEP 02</div><div>파일럿 제안</div><div>KPI · 견적</div></div>`,
      `<div style="${chrome}"><div>STEP 03</div><div>양산 전환 로드맵</div></div>`,
      '</div>',
      '<div style="font-family:VT323;font-size:20px">조직·운영·확장 계획 합의</div>',
      '</div></section>',
    ].join('');
    const out = absorbSpilledBodyAcrossGridBoundary(html, brief);
    const stepThreeIdx = out.indexOf('양산 전환 로드맵');
    const spilledIdx = out.indexOf('조직·운영·확장 계획 합의');
    const gridCloseIdx = out.indexOf('</div>', spilledIdx);
    expect(stepThreeIdx).toBeGreaterThan(-1);
    expect(spilledIdx).toBeGreaterThan(stepThreeIdx);
    expect(gridCloseIdx).toBeGreaterThan(spilledIdx);
    // Spilled text is now inside STEP 03 (before the </div> that used to
    // close it). The h2 divider sits earlier.
    expect(out.indexOf('다음 단계')).toBeLessThan(stepThreeIdx);
    // Sibling paragraph must NOT survive AFTER the grid (still one instance).
    expect((out.match(/조직·운영·확장 계획 합의/g) ?? []).length).toBe(1);
  });

  it('leaves a well-formed grid + external body alone', () => {
    const html = [
      '<div style="padding:48px 56px">',
      '<div style="display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:20px">',
      `<div style="${chrome}"><div>STEP 01</div><div>A</div><div>a</div></div>`,
      `<div style="${chrome}"><div>STEP 02</div><div>B</div><div>b</div></div>`,
      `<div style="${chrome}"><div>STEP 03</div><div>C</div><div>c</div></div>`,
      '</div>',
      '<div style="font-family:VT323;font-size:20px">각 단계 종료 시 게이트 체크</div>',
      '</div>',
    ].join('');
    expect(absorbSpilledBodyAcrossGridBoundary(html, brief)).toBe(html);
  });
});

describe('루프333 · stripDuplicatedInlineTailAfterSiblingClose', () => {
  it('drops an orphan <b>tail</b></div> that repeats the previous <b>', () => {
    const html = [
      '<div style="padding:14px 22px">',
      '<div style="font-family:VT323">3개년 CAGR <b>85%</b> · ARR 비중 <b>55%</b> · 해외 매출 <b>30%</b></div>',
      '<b style="color:#1084d0">30%</b></div>',
      '<div style="font-family:Press Start 2P">▶ EXIT-READY BY 2027</div>',
      '</div>',
    ].join('');
    const out = stripDuplicatedInlineTailAfterSiblingClose(html);
    expect((out.match(/>30%</g) ?? []).length).toBe(1);
    expect(out).toContain('▶ EXIT-READY BY 2027');
  });

  it('leaves a legitimate <b> in a fresh paragraph alone', () => {
    const html = [
      '<div><b>85%</b>는 3개년 목표입니다.</div>',
      '<div><b>재계약률 98%</b>를 유지합니다.</div>',
    ].join('');
    expect(stripDuplicatedInlineTailAfterSiblingClose(html)).toBe(html);
  });
});

describe('루프334 · dropChromeCardGridsWithAllEmptyBodies', () => {
  it('drops a grid whose 4 chrome cards each have only <br>-body slots', () => {
    const html = [
      '<section class="slide" data-screen-label="06 Tech Stack">',
      '<h2>기술 스택</h2>',
      '<div style="display:grid;grid-template-columns:repeat(1, 1fr);gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div style="font-family:VT323"><br><br><br></div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div style="font-family:VT323"><br><br><br></div></div>`,
      `<div style="${chrome}"><div>INFRA / CLOUD</div><div style="font-family:VT323"><br><br><br></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div style="font-family:VT323"><br><br><br></div></div>`,
      '</div>',
      '<div style="font-family:VT323">C:\\&gt; vendor-lock 없이 채택합니다.</div>',
      '</section>',
    ].join('');
    const out = dropChromeCardGridsWithAllEmptyBodies(html, brief);
    expect(out).not.toContain('LLM / NLP');
    expect(out).not.toContain('APP / UX');
    expect(out).toContain('기술 스택');
    expect(out).toContain('vendor-lock 없이 채택합니다.');
  });

  it('keeps a grid where at least one card has substantive body', () => {
    const html = [
      '<div style="display:grid;grid-template-columns:repeat(2, minmax(0,1fr));gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div style="font-family:VT323"><br><br><br></div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div style="font-family:VT323">Airflow, dbt, MLflow, LangGraph</div></div>`,
      '</div>',
    ].join('');
    expect(dropChromeCardGridsWithAllEmptyBodies(html, brief)).toBe(html);
  });

  it('drops a flex row whose chrome cards each have only <br>-body slots (루프340)', () => {
    const html = [
      '<section class="slide" data-screen-label="06 Tech Stack">',
      '<h2>기술 스택</h2>',
      '<div style="display:flex;gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div style="font-family:VT323"><br><br><br></div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div style="font-family:VT323"><br><br><br></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div style="font-family:VT323"><br><br><br></div></div>`,
      '</div>',
      '<div style="font-family:VT323">C:\\&gt; vendor-lock 없이 채택합니다.</div>',
      '</section>',
    ].join('');
    const out = dropChromeCardGridsWithAllEmptyBodies(html, brief);
    expect(out).not.toContain('LLM / NLP');
    expect(out).not.toContain('APP / UX');
    expect(out).toContain('기술 스택');
    expect(out).toContain('vendor-lock 없이 채택합니다.');
  });

  it('leaves a column flex stack of empty chrome cards alone (루프340)', () => {
    const html = [
      '<div style="display:flex;flex-direction:column;gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div style="font-family:VT323"><br><br><br></div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div style="font-family:VT323"><br><br><br></div></div>`,
      '</div>',
    ].join('');
    expect(dropChromeCardGridsWithAllEmptyBodies(html, brief)).toBe(html);
  });

  it('drops a class-bound flex row of empty <br>-body chrome cards (루프341)', () => {
    const html = [
      '<style>.cards{display:flex;gap:20px}</style>',
      '<section class="slide" data-screen-label="06 Tech Stack">',
      '<h2>기술 스택</h2>',
      '<div class="cards">',
      `<div style="${chrome}"><div>LLM / NLP</div><div style="font-family:VT323"><br><br><br></div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div style="font-family:VT323"><br><br><br></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div style="font-family:VT323"><br><br><br></div></div>`,
      '</div>',
      '<div style="font-family:VT323">C:\\&gt; vendor-lock 없이 채택합니다.</div>',
      '</section>',
    ].join('');
    const out = dropChromeCardGridsWithAllEmptyBodies(html, brief);
    expect(out).not.toContain('LLM / NLP');
    expect(out).not.toContain('APP / UX');
    expect(out).toContain('기술 스택');
    expect(out).toContain('vendor-lock 없이 채택합니다.');
  });

  it('leaves official English class-bound empty chrome alone without a brief (루프341)', () => {
    const html = [
      '<style>.cards{display:flex;gap:20px}</style>',
      '<div class="cards">',
      `<div style="${chrome}"><div>LLM / NLP</div><div><br><br><br></div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div><br><br><br></div></div>`,
      '</div>',
    ].join('');
    expect(dropChromeCardGridsWithAllEmptyBodies(html)).toBe(html);
  });
});

describe('루프342 · dropUnfilledChromeCardPeersInAllocatedRows', () => {
  it('drops only the unfilled chrome cards in a mixed grid row', () => {
    const html = [
      '<section class="slide" data-screen-label="06 Tech Stack">',
      '<h2>기술 스택</h2>',
      '<div style="display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div style="font-family:VT323">Llama, vLLM, LangGraph</div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div style="font-family:VT323"><br><br><br></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div style="font-family:VT323"><br><br><br></div></div>`,
      '</div>',
      '</section>',
    ].join('');
    const out = dropUnfilledChromeCardPeersInAllocatedRows(html, brief);
    expect(out).toContain('LLM / NLP');
    expect(out).toContain('Llama, vLLM, LangGraph');
    expect(out).not.toContain('DATA / MLOps');
    expect(out).not.toContain('APP / UX');
    expect(out).toContain('기술 스택');
  });

  it('drops unfilled chrome cards in a mixed flex row (루프342)', () => {
    const html = [
      '<div style="display:flex;gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div style="font-family:VT323">Llama, vLLM</div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div style="font-family:VT323"><br><br><br></div></div>`,
      '</div>',
    ].join('');
    const out = dropUnfilledChromeCardPeersInAllocatedRows(html, brief);
    expect(out).toContain('Llama, vLLM');
    expect(out).not.toContain('DATA / MLOps');
  });

  it('drops unfilled chrome cards in a mixed class-bound flex row (루프342)', () => {
    const html = [
      '<style>.cards{display:flex;gap:20px}</style>',
      '<div class="cards">',
      `<div style="${chrome}"><div>LLM / NLP</div><div style="font-family:VT323">Llama, vLLM</div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div style="font-family:VT323"><br><br><br></div></div>`,
      '</div>',
    ].join('');
    const out = dropUnfilledChromeCardPeersInAllocatedRows(html, brief);
    expect(out).toContain('Llama, vLLM');
    expect(out).not.toContain('DATA / MLOps');
  });

  it('leaves a fully filled chrome row alone (루프342)', () => {
    const html = [
      '<div style="display:flex;gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div>Llama</div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div>Airflow</div></div>`,
      '</div>',
    ].join('');
    expect(dropUnfilledChromeCardPeersInAllocatedRows(html, brief)).toBe(html);
  });

  it('leaves a column flex stack with mixed empty bodies alone (루프342)', () => {
    const html = [
      '<div style="display:flex;flex-direction:column;gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div>Llama</div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div style="font-family:VT323"><br><br><br></div></div>`,
      '</div>',
    ].join('');
    expect(dropUnfilledChromeCardPeersInAllocatedRows(html, brief)).toBe(html);
  });

  it('leaves official English mixed chrome alone without a brief (루프342)', () => {
    const html = [
      '<div style="display:flex;gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div>Llama</div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div><br><br><br></div></div>`,
      '</div>',
    ].join('');
    expect(dropUnfilledChromeCardPeersInAllocatedRows(html)).toBe(html);
  });

  it('pipeline removes mixed empty-body chrome cards without inventing copy (루프342)', () => {
    const html = [
      '<section class="slide"><h2>기술 스택</h2>',
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div>Llama, vLLM, LangGraph</div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div><br><br><br></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div><br><br><br></div></div>`,
      '</div></section>',
    ].join('');
    const out = healAiGeneratedDeckMarkup(html, brief);
    expect(out).toContain('기술 스택');
    expect(out).toContain('Llama, vLLM, LangGraph');
    expect(out).not.toContain('DATA / MLOps');
    expect(out).not.toContain('APP / UX');
    expect(out).not.toMatch(/기둥 Z|실카피/);
  });
});

describe('루프343 · empty div / &nbsp; body slots', () => {
  it('drops mixed-row chrome cards whose body slot is an empty div', () => {
    const html = [
      '<section class="slide" data-screen-label="06 Tech Stack">',
      '<h2>기술 스택</h2>',
      '<div style="display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div>Llama, vLLM, LangGraph</div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div>&nbsp;</div></div>`,
      '</div>',
      '</section>',
    ].join('');
    const out = dropUnfilledChromeCardPeersInAllocatedRows(html, brief);
    expect(out).toContain('LLM / NLP');
    expect(out).toContain('Llama, vLLM, LangGraph');
    expect(out).not.toContain('DATA / MLOps');
    expect(out).not.toContain('APP / UX');
    expect(out).toContain('기술 스택');
  });

  it('drops an all-empty-div chrome grid (루프334 path via widened unfilled)', () => {
    const html = [
      '<section class="slide" data-screen-label="06 Tech Stack">',
      '<h2>기술 스택</h2>',
      '<div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:20px">',
      `<div style="${chrome}"><div>DATA / MLOps</div><div></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div>&nbsp;</div></div>`,
      '</div>',
      '<div>vendor-lock 없이 채택합니다.</div>',
      '</section>',
    ].join('');
    const out = dropChromeCardGridsWithAllEmptyBodies(html, brief);
    expect(out).not.toContain('DATA / MLOps');
    expect(out).not.toContain('APP / UX');
    expect(out).toContain('기술 스택');
    expect(out).toContain('vendor-lock 없이 채택합니다.');
  });

  it('keeps label-only chrome chips that have no empty body slot', () => {
    const html = [
      '<div style="display:flex;gap:20px">',
      `<div style="${chrome}"><div>Llama</div></div>`,
      `<div style="${chrome}"><div>Airflow</div></div>`,
      '</div>',
    ].join('');
    expect(dropUnfilledChromeCardPeersInAllocatedRows(html, brief)).toBe(html);
  });

  it('pipeline removes empty-div body chrome without inventing copy (루프343)', () => {
    const html = [
      '<section class="slide"><h2>기술 스택</h2>',
      '<div style="display:flex;gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div>Llama, vLLM</div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div>&nbsp;</div></div>`,
      '</div></section>',
    ].join('');
    const out = healAiGeneratedDeckMarkup(html, brief);
    expect(out).toContain('기술 스택');
    expect(out).toContain('Llama, vLLM');
    expect(out).not.toContain('DATA / MLOps');
    expect(out).not.toContain('APP / UX');
    expect(out).not.toMatch(/기둥 Z|실카피/);
  });
});

describe('루프344 · empty <p>/<span> wrapper body slots', () => {
  it('drops mixed-row chrome cards whose body is an empty <p> wrapper', () => {
    const html = [
      '<section class="slide" data-screen-label="06 Tech Stack">',
      '<h2>기술 스택</h2>',
      '<div style="display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div>Llama, vLLM, LangGraph</div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div><p></p></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div><p><br></p></div></div>`,
      '</div>',
      '</section>',
    ].join('');
    const out = dropUnfilledChromeCardPeersInAllocatedRows(html, brief);
    expect(out).toContain('LLM / NLP');
    expect(out).toContain('Llama, vLLM, LangGraph');
    expect(out).not.toContain('DATA / MLOps');
    expect(out).not.toContain('APP / UX');
    expect(out).toContain('기술 스택');
  });

  it('drops empty <span> / nested empty wrappers in a mixed flex row', () => {
    const html = [
      '<div style="display:flex;gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div>Llama, vLLM</div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div><span></span></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div><p><span>&nbsp;</span></p></div></div>`,
      '</div>',
    ].join('');
    const out = dropUnfilledChromeCardPeersInAllocatedRows(html, brief);
    expect(out).toContain('Llama, vLLM');
    expect(out).not.toContain('DATA / MLOps');
    expect(out).not.toContain('APP / UX');
  });

  it('keeps a body slot that wraps real copy or media', () => {
    const html = [
      '<div style="display:flex;gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div><p>Llama, vLLM</p></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div><p><img src="mark.png" alt=""></p></div></div>`,
      '</div>',
    ].join('');
    expect(dropUnfilledChromeCardPeersInAllocatedRows(html, brief)).toBe(html);
  });

  it('pipeline removes empty-p body chrome without inventing copy (루프344)', () => {
    const html = [
      '<section class="slide"><h2>기술 스택</h2>',
      '<div style="display:flex;gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div>Llama, vLLM</div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div><p></p></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div><p><br></p></div></div>`,
      '</div></section>',
    ].join('');
    const out = healAiGeneratedDeckMarkup(html, brief);
    expect(out).toContain('기술 스택');
    expect(out).toContain('Llama, vLLM');
    expect(out).not.toContain('DATA / MLOps');
    expect(out).not.toContain('APP / UX');
    expect(out).not.toMatch(/기둥 Z|실카피/);
  });
});

describe('루프352 · mixed chrome + non-chrome empty peers', () => {
  it('drops empty chrome peers beside a filled .card in a grid', () => {
    const html = [
      '<section class="slide" data-screen-label="06 Tech Stack">',
      '<h2>기술 스택</h2>',
      '<div style="display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:20px">',
      '<div class="card"><h3>LLM / NLP</h3><p>Llama, vLLM, LangGraph</p></div>',
      `<div style="${chrome}"><div>DATA / MLOps</div><div><p></p></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div><br></div></div>`,
      '</div>',
      '</section>',
    ].join('');
    const out = dropUnfilledChromeCardPeersInAllocatedRows(html, brief);
    expect(out).toContain('LLM / NLP');
    expect(out).toContain('Llama, vLLM, LangGraph');
    expect(out).not.toContain('DATA / MLOps');
    expect(out).not.toContain('APP / UX');
    expect(out).toContain('기술 스택');
  });

  it('drops empty chrome peers beside a filled list in a flex row', () => {
    const html = [
      '<div style="display:flex;gap:20px">',
      `<div style="${chrome}"><div>PLAN A</div><div>파일럿 (8주)</div></div>`,
      '<ul><li>KPI 정의 + 프로토타입</li></ul>',
      `<div style="${chrome}"><div>DATA / MLOps</div><div></div></div>`,
      '</div>',
    ].join('');
    const out = dropUnfilledChromeCardPeersInAllocatedRows(html, brief);
    expect(out).toContain('PLAN A');
    expect(out).toContain('KPI 정의 + 프로토타입');
    expect(out).not.toContain('DATA / MLOps');
  });

  it('leaves a mixed row of empty chrome and an empty spacer alone', () => {
    const html = [
      '<div style="display:flex;gap:20px">',
      `<div style="${chrome}"><div>DATA / MLOps</div><div><p></p></div></div>`,
      '<div></div>',
      '</div>',
    ].join('');
    expect(dropUnfilledChromeCardPeersInAllocatedRows(html, brief)).toBe(html);
  });

  it('leaves a column flex mixed chrome + .card row alone', () => {
    const html = [
      '<div style="display:flex;flex-direction:column;gap:20px">',
      '<div class="card"><h3>LLM / NLP</h3><p>Llama, vLLM</p></div>',
      `<div style="${chrome}"><div>DATA / MLOps</div><div><p></p></div></div>`,
      '</div>',
    ].join('');
    expect(dropUnfilledChromeCardPeersInAllocatedRows(html, brief)).toBe(html);
  });

  it('does not drop the whole mixed grid on the all-empty-chrome path', () => {
    const html = [
      '<section class="slide"><h2>기술 스택</h2>',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">',
      '<div class="card"><h3>LLM / NLP</h3><p>Llama, vLLM</p></div>',
      `<div style="${chrome}"><div>DATA / MLOps</div><div><p></p></div></div>`,
      '</div></section>',
    ].join('');
    const out = dropChromeCardGridsWithAllEmptyBodies(html, brief);
    expect(out).toContain('LLM / NLP');
    expect(out).toContain('DATA / MLOps');
  });

  it('leaves official English mixed chrome + .card alone without a brief', () => {
    const html = [
      '<div style="display:flex;gap:20px">',
      '<div class="card"><h3>LLM / NLP</h3><p>Llama, vLLM</p></div>',
      `<div style="${chrome}"><div>DATA / MLOps</div><div><p></p></div></div>`,
      '</div>',
    ].join('');
    expect(dropUnfilledChromeCardPeersInAllocatedRows(html)).toBe(html);
  });

  it('pipeline removes mixed-row empty chrome without inventing copy (루프352)', () => {
    const html = [
      '<section class="slide"><h2>기술 스택</h2>',
      '<div style="display:flex;gap:20px">',
      '<div class="card"><h3>LLM / NLP</h3><p>Llama, vLLM</p></div>',
      `<div style="${chrome}"><div>DATA / MLOps</div><div><p></p></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div><p><br></p></div></div>`,
      '</div></section>',
    ].join('');
    const out = healAiGeneratedDeckMarkup(html, brief);
    expect(out).toContain('기술 스택');
    expect(out).toContain('Llama, vLLM');
    expect(out).not.toContain('DATA / MLOps');
    expect(out).not.toContain('APP / UX');
    expect(out).not.toMatch(/기둥 Z|실카피/);
  });
});

describe('healAiGeneratedDeckMarkup · neuralstudio.kr 회사소개 잔여', () => {
  it('applies 루프331 / 333 / 334 in a single heal pass', () => {
    const html = [
      '<section class="slide slide-title">',
      '<div data-od-slide-flow=""><h1>neuralstudio.kr 회사</h1></div>',
      '</section>',
      '<section class="slide" data-screen-label="06 Tech Stack">',
      '<div data-od-slide-flow=""><h2>검증된 오픈소스 기반 기술 스택</h2>',
      '<div style="display:grid;grid-template-columns:repeat(1, 1fr);gap:20px">',
      `<div style="${chrome}"><div>LLM / NLP</div><div style="font-family:VT323"><br><br><br></div></div>`,
      `<div style="${chrome}"><div>DATA / MLOps</div><div style="font-family:VT323"><br><br><br></div></div>`,
      `<div style="${chrome}"><div>INFRA / CLOUD</div><div style="font-family:VT323"><br><br><br></div></div>`,
      `<div style="${chrome}"><div>APP / UX</div><div style="font-family:VT323"><br><br><br></div></div>`,
      '</div>',
      '<div style="font-family:VT323">C:\\&gt; vendor-lock 없이 채택합니다.</div>',
      '</div></section>',
      '<section class="slide" data-screen-label="07 Close">',
      '<div data-od-slide-flow="">',
      '<h2 style="font-size:64px">신뢰할 수 있는 AI 파트너,<br>neuralstudio.kr</h2>',
      ' AI 파트너,<br>neuralstudio.kr ',
      '<div style="font-family:VT323">파일럿 1건부터 시작해 ROI를 검증합니다.</div>',
      '</div></section>',
      '<section class="slide" data-screen-label="10 Roadmap">',
      '<div data-od-slide-flow="">',
      '<div style="padding:14px 22px">',
      '<div style="font-family:VT323">3개년 CAGR <b>85%</b> · ARR 비중 <b>55%</b> · 해외 매출 비중 <b>30%</b></div>',
      '<b style="color:#1084d0">30%</b></div>',
      '<div style="font-family:Press Start 2P">▶ EXIT-READY BY 2027</div>',
      '</div>',
      '</div></section>',
    ].join('');
    const out = healAiGeneratedDeckMarkup(html, brief);
    // heading tail dup gone (only one AI 파트너 phrase remains — inside <h2>)
    const partnerMatches = out.match(/AI 파트너/g) ?? [];
    expect(partnerMatches.length).toBeLessThanOrEqual(1);
    // Empty tech-stack grid gone; kicker footer + title kept
    expect(out).not.toContain('LLM / NLP');
    expect(out).not.toContain('APP / UX');
    expect(out).toContain('검증된 오픈소스 기반 기술 스택');
    expect(out).toContain('vendor-lock 없이 채택합니다.');
    // Orphan <b>30%</b></div> dup gone
    expect((out.match(/>30%</g) ?? []).length).toBe(1);
    expect(out).toContain('EXIT-READY BY 2027');
    // Deck stays intact (no invented copy)
    expect(out).not.toMatch(/기둥 P|열아홉째/);
    expect(out).toContain('파일럿 1건부터 시작해 ROI를 검증합니다.');
  });
});
