/**
 * 루프270 · Flatten nested duplicate `.card` open (MiniMax fill bug).
 *
 * 사용자 리포트 2026-08-31 · 삼각함수 pitch-deck (slide 4 항등식 · 5 그래프):
 *   MiniMax fill이 각 카드 시작 시 nested duplicate open을 emit:
 *     <div class="card"><div class="card"><div>제목</div></div><공식><설명></div>
 *   원본은 태그 balance는 맞지만 loop194 peer-split이 두 번째 card open을
 *   sibling으로 갈라내면서 outer card 안에 있어야 할 공식/설명이 밖으로
 *   튀어나옴. loop199 `unwrapRedundantNestedPeerCards`는 outer가 자체
 *   text/자식 없이 정확히 한 자식일 때만 unwrap이라 이 case 밖.
 *
 * 새 방어 `flattenNestedDuplicateCardOpens`:
 *   - 인접한 두 card open 태그가 exact same-token cardish
 *     (`<div class="card"><div class="card">`) 감지
 *   - 두 open 사이에 실체 content가 없음 (공백/개행만)
 *   - 안쪽 open + 그 대응 close 페어를 함께 strip → outer flat card
 *   - Content 전혀 잃지 않음 · 태그 balance 유지
 *   - `data-od-official-motif-html` / motif 데코 shell은 보존
 *   - Idempotent · Hangul/brief-gate로 official English catalog 보호
 */

import { describe, expect, it } from 'vitest';
import {
  flattenNestedDuplicateCardOpens,
  healAiGeneratedDeckMarkup,
} from '../src/html/heal-ai-generated-deck.js';

const brief = '삼각함수에 대해서 설명하는 피피티 만들어줘.';

describe('루프270 · flattenNestedDuplicateCardOpens', () => {
  describe('core behaviour', () => {
    it('flattens `<div class="card"><div class="card">X</div>Y</div>` to `<div class="card">X Y</div>`', () => {
      const html = [
        '<section class="slide" data-screen-label="04 항등식"><div data-od-slide-flow>',
        '<div class="card"> <div class="card"> <div>피타고라스</div> </div> <div>공식</div> <div>설명</div> </div>',
        '</div></section>',
      ].join('');
      const out = flattenNestedDuplicateCardOpens(html);
      const cardCount = (out.match(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bcard\b/gi) ?? []).length;
      expect(cardCount).toBe(1);
      expect(out).toContain('피타고라스');
      expect(out).toContain('공식');
      expect(out).toContain('설명');
    });

    it('preserves div balance (no extra opens or closes)', () => {
      const html = [
        '<section class="slide"><div data-od-slide-flow>',
        '<div class="card"><div class="card"><div>제목</div></div><div>본문</div></div>',
        '</div></section>',
      ].join('');
      const out = flattenNestedDuplicateCardOpens(html);
      const opens = (out.match(/<div\b/gi) ?? []).length;
      const closes = (out.match(/<\/div>/gi) ?? []).length;
      expect(opens).toBe(closes);
    });

    it('flattens all 5 nested duplicate cards in a 5-card grid', () => {
      const cards = Array.from({ length: 5 }, (_, i) => [
        `<div class="card"> <div class="card"> <div>제목${i}</div> </div> <div>공식${i}</div> </div>`,
      ].join('')).join(' ');
      const html = `<section class="slide"><div data-od-slide-flow>${cards}</div></section>`;
      const out = flattenNestedDuplicateCardOpens(html);
      const cardCount = (out.match(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bcard\b/gi) ?? []).length;
      expect(cardCount).toBe(5);
      for (let i = 0; i < 5; i += 1) {
        expect(out).toContain(`제목${i}`);
        expect(out).toContain(`공식${i}`);
      }
    });

    it('handles tokens beyond `.card` (pillar/tile/panel/cell/box/metric/stat/kpi)', () => {
      const html = [
        '<section class="slide"><div data-od-slide-flow>',
        '<div class="pillar"><div class="pillar"><div>A</div></div><div>B</div></div>',
        '<div class="tile"><div class="tile"><div>C</div></div><div>D</div></div>',
        '</div></section>',
      ].join('');
      const out = flattenNestedDuplicateCardOpens(html);
      expect((out.match(/\bclass\s*=\s*["'][^"']*\bpillar\b/gi) ?? []).length).toBe(1);
      expect((out.match(/\bclass\s*=\s*["'][^"']*\btile\b/gi) ?? []).length).toBe(1);
      expect(out).toContain('A');
      expect(out).toContain('B');
      expect(out).toContain('C');
      expect(out).toContain('D');
    });

    it('flattens nested `<section class="card">` duplicates (루프277)', () => {
      const html = [
        '<section class="slide"><div data-od-slide-flow>',
        '<section class="card"><section class="card"><div>제목</div></section><div>본문</div></section>',
        '</div></section>',
      ].join('');
      const out = flattenNestedDuplicateCardOpens(html);
      const cardOpens = (out.match(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bcard\b/gi) ?? []).length;
      expect(cardOpens).toBe(1);
      expect(out).toContain('제목');
      expect(out).toContain('본문');
      const opens = (out.match(/<section\b/gi) ?? []).length;
      const closes = (out.match(/<\/section>/gi) ?? []).length;
      expect(opens).toBe(closes);
    });

    it('flattens nested `<article class="panel">` duplicates (루프277)', () => {
      const html = [
        '<section class="slide"><div data-od-slide-flow>',
        '<article class="panel"><article class="panel"><h3>A</h3></article><p>B</p></article>',
        '</div></section>',
      ].join('');
      const out = flattenNestedDuplicateCardOpens(html);
      expect((out.match(/<article\b[^>]*\bclass\s*=\s*["'][^"']*\bpanel\b/gi) ?? []).length).toBe(1);
      expect(out).toContain('A');
      expect(out).toContain('B');
    });

    it('is idempotent — a second pass changes nothing', () => {
      const html = [
        '<section class="slide"><div data-od-slide-flow>',
        '<div class="card"><div class="card"><div>제목</div></div><div>본문</div></div>',
        '</div></section>',
      ].join('');
      const once = flattenNestedDuplicateCardOpens(html);
      const twice = flattenNestedDuplicateCardOpens(once);
      expect(twice).toBe(once);
    });
  });

  describe('regression guards', () => {
    it('does not flatten when the outer has meaningful text between the two opens', () => {
      const html = [
        '<section class="slide"><div data-od-slide-flow>',
        '<div class="card"> outer prose <div class="card"> <div>inner</div> </div> </div>',
        '</div></section>',
      ].join('');
      const out = flattenNestedDuplicateCardOpens(html);
      const cardCount = (out.match(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bcard\b/gi) ?? []).length;
      expect(cardCount).toBe(2);
    });

    it('does not touch `data-od-official-motif-html` shells', () => {
      const html = [
        '<section class="slide"><div data-od-slide-flow>',
        '<div class="card" data-od-official-motif-html><div class="card"><div>motif</div></div></div>',
        '</div></section>',
      ].join('');
      const out = flattenNestedDuplicateCardOpens(html);
      const cardCount = (out.match(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bcard\b/gi) ?? []).length;
      expect(cardCount).toBe(2);
    });

    it('does not flatten different tokens (card + panel are not duplicate)', () => {
      const html = [
        '<section class="slide"><div data-od-slide-flow>',
        '<div class="card"><div class="panel"><div>X</div></div><div>Y</div></div>',
        '</div></section>',
      ].join('');
      const out = flattenNestedDuplicateCardOpens(html);
      const cardCount = (out.match(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bcard\b/gi) ?? []).length;
      const panelCount = (out.match(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bpanel\b/gi) ?? []).length;
      expect(cardCount).toBe(1);
      expect(panelCount).toBe(1);
    });

    it('preserves inline styles on the surviving outer card', () => {
      const html = [
        '<section class="slide"><div data-od-slide-flow>',
        '<div style="background:#fff;border-radius:18px" class="card">',
        ' <div style="background:#fff;border-radius:18px" class="card">',
        '  <div>title</div>',
        ' </div>',
        ' <div>body</div>',
        '</div>',
        '</div></section>',
      ].join('');
      const out = flattenNestedDuplicateCardOpens(html);
      expect(out).toMatch(/background:#fff;border-radius:18px/);
    });
  });

  describe('user fixture · slide 4 (04 항등식)', () => {
    it('healAiGeneratedDeckMarkup end-to-end collapses nested duplicate cards to 5 flat cards', () => {
      // Simplified 5-card grid mirroring the user fixture shape (slide 4).
      const cardBlock = (title: string, formula: string, note: string) => [
        '<div style="background:#fff;padding:22px" class="card">',
        ` <div style="background:#fff;padding:22px" class="card">`,
        `  <div style="font-size:11px;color:#8a90ad">${title}</div>`,
        ' </div>',
        ` <div style="font-family:monospace;font-size:22px">${formula}</div>`,
        ` <div style="font-size:15px;color:#4a5070">${note}</div>`,
        '</div>',
      ].join(' ');
      const grid = [
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:22px">',
        cardBlock('피타고라스', 'sin²θ + cos²θ = 1', '단위원 위의 한 점'),
        cardBlock('탄젠트 분해', 'tan θ = sin θ / cos θ', 'cos θ ≠ 0'),
        cardBlock('상호 관계', '1 + tan²θ = sec²θ', 'sec θ = 1 / cos θ'),
        cardBlock('각의 덧셈', 'sin(A±B)', 'cos 부호 반대'),
        cardBlock('이배각', 'sin 2θ = 2sinθ cosθ', 'cos 2θ'),
        '</div>',
      ].join('');
      const html = [
        '<!doctype html><html lang="ko"><body class="tpl-pitch-deck">',
        '<section class="slide" data-screen-label="04 항등식" style="width:1920px;height:1080px">',
        '<div data-od-slide-flow>',
        '<h2>반드시 외워야 할 핵심 항등식</h2>',
        grid,
        '</div></section></body></html>',
      ].join('');

      const healed = healAiGeneratedDeckMarkup(html, brief);
      const cardCount = (healed.match(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bcard\b/gi) ?? []).length;
      expect(cardCount).toBe(5);
      // Content survives.
      for (const marker of ['피타고라스', '탄젠트 분해', '상호 관계', '각의 덧셈', '이배각']) {
        expect(healed).toContain(marker);
      }
      // Div balance restored (no leaking closes).
      const slide4 = healed.match(/<section\b[^>]*data-screen-label\s*=\s*["']04 항등식["'][\s\S]*?<\/section>/)?.[0] ?? '';
      const opens = (slide4.match(/<div\b/gi) ?? []).length;
      const closes = (slide4.match(/<\/div>/gi) ?? []).length;
      expect(opens).toBe(closes);
    });
  });
});
