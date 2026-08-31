/**
 * 루프295–298 residuals that sit next to equal-track / spill heals.
 */

import { describe, expect, it } from 'vitest';
import {
  absorbSpilledChromeCardSiblings,
  dropAdjacentDuplicatePeerCards,
  dropDuplicateConsecutiveSubstanceSlides,
  healAiGeneratedDeckMarkup,
} from '../src/html/heal-ai-generated-deck.js';

const brief = '삼각함수에 대해서 설명하는 피피티 만들어줘.';
const chrome =
  'border:2px solid #3A2516;background:#F1E6CB;color:#3A2516;padding:32px 28px';
const longClose =
  '정의에서 단위원과 항등식을 거쳐 실전 응용까지 이으면 주기 현상을 읽을 수 있다.';

describe('루프295 · dropDuplicateConsecutiveSubstanceSlides', () => {
  it('drops the later of two consecutive identical substance slides', () => {
    const slide = [
      '<section class="slide" data-screen-label="06 마무리">',
      `<h2>각을 다루는 언어</h2><p>${longClose}</p>`,
      '</section>',
    ].join('');
    const html = `${slide}${slide}`;
    const out = dropDuplicateConsecutiveSubstanceSlides(html);
    expect((out.match(/data-screen-label="06 마무리"/g) ?? []).length).toBe(1);
    expect(out).toContain('각을 다루는 언어');
    expect(out).toContain(longClose);
  });

  it('keeps consecutive slides whose bodies differ', () => {
    const html = [
      '<section class="slide" data-screen-label="06 마무리">',
      `<h2>각을 다루는 언어</h2><p>${longClose}</p>`,
      '</section>',
      '<section class="slide" data-screen-label="06 마무리">',
      `<h2>각을 다루는 언어</h2><p>${longClose} 다음 단원에서 이어간다.</p>`,
      '</section>',
    ].join('');
    expect(dropDuplicateConsecutiveSubstanceSlides(html)).toBe(html);
  });

  it('keeps non-adjacent identical substance slides (chapter reuse)', () => {
    const closer = [
      '<section class="slide" data-screen-label="06 마무리">',
      `<h2>각을 다루는 언어</h2><p>${longClose}</p>`,
      '</section>',
    ].join('');
    const mid = [
      '<section class="slide" data-screen-label="03 단위원">',
      `<h2>단위원</h2><p>${longClose} 좌표로 확장한다.</p>`,
      '</section>',
    ].join('');
    const html = `${closer}${mid}${closer}`;
    expect(dropDuplicateConsecutiveSubstanceSlides(html)).toBe(html);
  });
});

describe('루프297 · dropAdjacentDuplicatePeerCards', () => {
  it('drops the later of two adjacent identical chrome cards', () => {
    const card = `<div style="${chrome}"><div>① 피타고라스 항등식</div><div>sin²θ + cos²θ = 1</div></div>`;
    const html = [
      '<section class="slide">',
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:24px">',
      card,
      card,
      `<div style="${chrome}"><div>② 배각 공식</div><div>sin2θ = 2 sinθ cosθ</div></div>`,
      '</div></section>',
    ].join('');
    const out = dropAdjacentDuplicatePeerCards(html, brief);
    expect((out.match(/피타고라스 항등식/g) ?? []).length).toBe(1);
    expect(out).toContain('② 배각 공식');
  });

  it('keeps adjacent cards whose copy differs', () => {
    const html = [
      '<section class="slide">',
      '<div style="display:flex;gap:24px">',
      `<div style="${chrome}"><div>① 피타고라스 항등식</div></div>`,
      `<div style="${chrome}"><div>② 배각 공식</div></div>`,
      '</div></section>',
    ].join('');
    expect(dropAdjacentDuplicatePeerCards(html, brief)).toBe(html);
  });
});

describe('루프298 · class-bound spilled chrome absorb', () => {
  it('absorbs spilled siblings in a class-bound flex row', () => {
    const html = [
      '<style>.cards{display:flex;gap:24px}</style>',
      '<section class="slide">',
      '<div class="cards">',
      `<div style="${chrome}"><div>① 피타고라스 항등식</div></div>`,
      '<div style="font-size:54px">sin²θ + cos²θ = 1</div>',
      `<div style="${chrome}"><div>② 배각 공식</div><div>sin2θ = 2 sinθ cosθ</div></div>`,
      `<div style="${chrome}"><div>③ 덧셈 공식</div><div>sin(A±B)</div></div>`,
      '</div></section>',
    ].join('');
    const out = absorbSpilledChromeCardSiblings(html, brief);
    expect(out.indexOf('sin²θ + cos²θ = 1')).toBeGreaterThan(out.indexOf('① 피타고라스 항등식'));
    expect(out.indexOf('sin²θ + cos²θ = 1')).toBeLessThan(out.indexOf('② 배각 공식'));
    expect((out.match(/background:#F1E6CB/g) ?? []).length).toBe(3);
  });

  it('absorbs spilled siblings in a class-bound 3-col grid', () => {
    const html = [
      '<style>.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}</style>',
      '<section class="slide">',
      '<div class="grid">',
      `<div style="${chrome}"><div>① 피타고라스 항등식</div></div>`,
      '<div style="font-size:54px">sin²θ + cos²θ = 1</div>',
      '<div style="font-size:22px">모든 각도에서 성립하는 가장 기본 항등식</div>',
      `<div style="${chrome}"><div>② 배각 공식</div><div>sin2θ = 2 sinθ cosθ</div></div>`,
      `<div style="${chrome}"><div>③ 덧셈 공식</div><div>sin(A±B)</div></div>`,
      '</div></section>',
    ].join('');
    const out = absorbSpilledChromeCardSiblings(html, brief);
    expect(out.indexOf('sin²θ + cos²θ = 1')).toBeLessThan(out.indexOf('② 배각 공식'));
  });

  it('drops adjacent identical cards in a class-bound flex row (루프301)', () => {
    const card = `<div style="${chrome}"><div>① 피타고라스 항등식</div><div>sin²θ + cos²θ = 1</div></div>`;
    const html = [
      '<style>.cards{display:flex;gap:24px}</style>',
      '<section class="slide">',
      '<div class="cards">',
      card,
      card,
      `<div style="${chrome}"><div>② 배각 공식</div><div>sin2θ = 2 sinθ cosθ</div></div>`,
      '</div></section>',
    ].join('');
    const out = dropAdjacentDuplicatePeerCards(html, brief);
    expect((out.match(/피타고라스 항등식/g) ?? []).length).toBe(1);
    expect(out).toContain('② 배각 공식');
  });

  it('pipeline does not invent leftover P copy (루프295–298)', () => {
    const html = [
      '<section class="slide" data-screen-label="06 마무리">',
      `<h2>각을 다루는 언어</h2><p>${longClose}</p>`,
      '</section>',
      '<section class="slide" data-screen-label="06 마무리">',
      `<h2>각을 다루는 언어</h2><p>${longClose}</p>`,
      '</section>',
    ].join('');
    const out = healAiGeneratedDeckMarkup(html, brief);
    expect((out.match(/data-screen-label="06 마무리"/g) ?? []).length).toBe(1);
    expect(out).not.toMatch(/기둥 P|열아홉째/);
  });
});
