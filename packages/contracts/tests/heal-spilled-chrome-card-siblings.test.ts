/**
 * 루프293 · Absorb spilled chrome-card siblings + flatten same-style nest.
 *
 * MiniMax editorial fill often skips `class="card"` and paints chrome with
 * inline border/background/padding. Two leftovers then break the row:
 *   1. Nested identical chrome (`<div style=chrome><div style=chrome>TAN`)
 *   2. Label-only close, so the formula/body become extra grid children and
 *      shrink promotes them to leftover columns.
 */

import { describe, expect, it } from 'vitest';
import {
  absorbSpilledChromeCardSiblings,
  flattenNestedDuplicateCardOpens,
  healAiGeneratedDeckMarkup,
} from '../src/html/heal-ai-generated-deck.js';

const brief = '삼각함수에 대해서 설명하는 피피티 만들어줘.';
const chrome =
  'border:2px solid #3A2516;background:#F1E6CB;color:#3A2516;padding:32px 28px';
const label = 'font-family:monospace;font-size:18px;color:#E5392A';
const formula = 'font-family:sans-serif;font-weight:900;font-size:54px;color:#3A2516';
const body = 'font-family:sans-serif;font-size:22px;color:#3A2516';

describe('루프293 · absorbSpilledChromeCardSiblings', () => {
  it('pulls formula + body back into a label-only chrome card (3-col)', () => {
    const html = [
      '<section class="slide" data-screen-label="04 공식">',
      `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:24px">`,
      `<div style="${chrome}"><div style="${label}">① 피타고라스 항등식</div></div>`,
      `<div style="${formula}">sin²θ + cos²θ = 1</div>`,
      `<div style="${body}">모든 각도에서 성립하는 가장 기본 항등식</div>`,
      `<div style="${chrome}"><div style="${label}">② 배각 공식</div>`,
      `<div style="${formula}">sin2θ = 2 sinθ cosθ</div>`,
      `<div style="${body}">cos2θ 도 자주 등장</div></div>`,
      `<div style="${chrome}"><div style="${label}">③ 덧셈 공식</div>`,
      `<div style="${formula}">sin(A±B)</div>`,
      `<div style="${body}">sinAcosB 형태로 전개</div></div>`,
      '</div></section>',
    ].join('');
    const out = absorbSpilledChromeCardSiblings(html, brief);
    const labelAt = out.indexOf('① 피타고라스 항등식');
    const formulaAt = out.indexOf('sin²θ + cos²θ = 1');
    const nextCardAt = out.indexOf('② 배각 공식');
    expect(labelAt).toBeGreaterThan(-1);
    expect(formulaAt).toBeGreaterThan(labelAt);
    expect(formulaAt).toBeLessThan(nextCardAt);
    expect((out.match(/background:#F1E6CB/g) ?? []).length).toBe(3);
    expect(out).toContain('③ 덧셈 공식');
  });

  it('absorbs only when the grid has more children than declared columns', () => {
    const html = [
      '<section class="slide">',
      `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px">`,
      `<div style="${chrome}"><div style="${label}">PHYSICS · 물리</div></div>`,
      `<div style="${formula}">진자·파동·포물선</div>`,
      `<div style="${chrome}"><div style="${label}">ENGINEERING · 공학</div>`,
      `<div style="${formula}">전기·신호·그래픽</div></div>`,
      '</div></section>',
    ].join('');
    const out = absorbSpilledChromeCardSiblings(html, brief);
    expect(out).toMatch(/PHYSICS[\s\S]*진자·파동·포물선[\s\S]*ENGINEERING/);
    expect(out).toContain('전기·신호·그래픽');
  });

  it('leaves a filled equal-column row alone', () => {
    const html = [
      '<section class="slide">',
      `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:24px">`,
      `<div style="${chrome}"><div style="${label}">①</div><div style="${formula}">aaa 본문입니다</div></div>`,
      `<div style="${chrome}"><div style="${label}">②</div><div style="${formula}">bbb 본문입니다</div></div>`,
      `<div style="${chrome}"><div style="${label}">③</div><div style="${formula}">ccc 본문입니다</div></div>`,
      '</div></section>',
    ].join('');
    expect(absorbSpilledChromeCardSiblings(html, brief)).toBe(html);
  });

  it('does not swallow a 3-letter absolute footer into the last card', () => {
    const html = [
      '<section class="slide">',
      `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:24px">`,
      `<div style="${chrome}"><div style="${label}">SIN</div></div>`,
      `<div style="${chrome}"><div style="${label}">COS</div></div>`,
      `<div style="${chrome}"><div style="${label}">TAN</div></div>`,
      '<div style="position:absolute;right:80px;bottom:60px;font-size:18px">SOH</div>',
      '</div></section>',
    ].join('');
    const out = absorbSpilledChromeCardSiblings(html, brief);
    expect(out).toBe(html);
    expect(out).toContain('position:absolute');
    expect(out).toContain('SOH');
  });

  it('leaves a 50/50 split and px sidebar alone', () => {
    const split = [
      '<section class="slide">',
      '<div style="display:grid;grid-template-columns:calc(50%) calc(50%);gap:24px">',
      `<div style="${chrome}"><div style="${label}">목차</div></div>`,
      '<div style="font-size:22px">본문 설명 텍스트입니다</div>',
      '</div></section>',
    ].join('');
    expect(absorbSpilledChromeCardSiblings(split, brief)).toBe(split);

    const sidebar = [
      '<section class="slide">',
      '<div style="display:grid;grid-template-columns:minmax(280px,1fr) minmax(900px,2fr);gap:24px">',
      `<div style="${chrome}"><div style="${label}">목차</div></div>`,
      '<div style="font-size:22px">본문 설명 텍스트입니다</div>',
      '</div></section>',
    ].join('');
    expect(absorbSpilledChromeCardSiblings(sidebar, brief)).toBe(sidebar);
  });

  it('flattens nested identical chrome without class=card (루프293)', () => {
    const nest = [
      '<section class="slide">',
      `<div style="${chrome}">`,
      `<div style="${chrome}">`,
      `<div style="${label}">TAN</div>`,
      '<div style="font-size:64px">θ</div>',
      '</div></div>',
      '</section>',
    ].join('');
    const out = flattenNestedDuplicateCardOpens(nest);
    expect((out.match(/background:#F1E6CB/g) ?? []).length).toBe(1);
    expect(out).toContain('TAN');
    expect(out).toContain('θ');
  });

  it('pipeline keeps 3 formula cards and does not invent copy', () => {
    const html = [
      '<section class="slide" data-screen-label="04 핵심 공식">',
      `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:24px">`,
      `<div style="${chrome}"><div style="${label}">① 피타고라스 항등식</div></div>`,
      `<div style="${formula}">sin²θ + cos²θ = 1</div>`,
      `<div style="${body}">모든 각도에서 성립하는 가장 기본 항등식</div>`,
      `<div style="${chrome}"><div style="${label}">② 배각 공식</div>`,
      `<div style="${formula}">sin2θ = 2 sinθ cosθ</div>`,
      `<div style="${body}">cos2θ 도 자주 등장</div></div>`,
      `<div style="${chrome}"><div style="${label}">③ 덧셈 공식</div>`,
      `<div style="${formula}">sin(A±B)</div>`,
      `<div style="${body}">sinAcosB 형태로 전개</div></div>`,
      '</div></section>',
    ].join('');
    const out = healAiGeneratedDeckMarkup(html, brief);
    expect(out).toContain('① 피타고라스 항등식');
    expect(out).toContain('sin²θ + cos²θ = 1');
    expect(out).toContain('② 배각 공식');
    expect(out).toContain('③ 덧셈 공식');
    expect(out).not.toMatch(/기둥 P|열아홉째/);
    expect(out.match(/grid-template-columns:repeat\(\s*5\s*,/i)).toBeNull();
  });
});
