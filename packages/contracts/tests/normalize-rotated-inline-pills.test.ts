import { describe, expect, it } from 'vitest';

import {
  normalizeRotatedInlinePills,
  salvageMalformedMiniMaxSlideMarkup,
} from '../src/template-clone-fill.js';

/**
 * 루프397 — MiniMax neo-brutal decks often ship a tilted decorative label as
 * `<div style="padding:...;background:...;border:...;transform:rotate(4deg)">
 * OVERVIEW</div>` — a block-level element without `display:inline-block` or
 * explicit `width`. `<div>` fills the parent, `transform:rotate` then paints
 * a giant diagonal bar that swallows the slide content below (user report
 * 2026-09-03 slide 02).
 *
 * `normalizeRotatedInlinePills` targets exactly that: a rotated pill-shaped
 * div (padding + background + border/shadow) with only leaf text and no
 * existing sizing declarations gets `display:inline-block;width:fit-content;`
 * appended so the rotation stays local.
 *
 * Explicit non-goals:
 *   - full-width CTA rows without rotation (slide 6 stacked bars stay full),
 *   - pills that already declare inline-block / a width,
 *   - long paragraphs (> 120 chars leaf text) or divs containing nested
 *     blocks (never touch card bodies or grid cells).
 */
describe('normalizeRotatedInlinePills — rotated pill inline-block normalization', () => {
  it('adds display:inline-block + width:fit-content to a bare rotated pill', () => {
    const input = '<div style="padding:14px 22px;background:#FE90E8;border:4px solid #000;box-shadow:6px 6px 0 #000;font-family:\'Space Grotesk\',monospace;font-size:16px;font-weight:700;transform:rotate(4deg)">OVERVIEW</div>';
    const out = normalizeRotatedInlinePills(input);
    expect(out).toContain('display:inline-block');
    expect(out).toContain('width:fit-content');
    expect(out).toContain('transform:rotate(4deg)');
    expect(out).toContain('OVERVIEW');
  });

  it('does NOT touch a rotated pill that already declares an explicit width', () => {
    const input = '<div style="width:180px;padding:10px;background:#F7CB46;border:4px solid #000;transform:rotate(-3deg)">TEAMVER · 2025</div>';
    const out = normalizeRotatedInlinePills(input);
    expect(out).toBe(input);
  });

  it('does NOT touch a rotated pill that already declares display:inline-block', () => {
    const input = '<div style="display:inline-block;padding:10px;background:#C0F7FE;border:4px solid #000;transform:rotate(3deg)">SERVICE INTRO</div>';
    const out = normalizeRotatedInlinePills(input);
    expect(out).toBe(input);
  });

  it('does NOT touch a rotated pill that already declares display:flex', () => {
    const input = '<div style="display:flex;padding:10px;background:#C0F7FE;border:4px solid #000;transform:rotate(3deg)">SERVICE INTRO</div>';
    const out = normalizeRotatedInlinePills(input);
    expect(out).toBe(input);
  });

  it('does NOT touch an unrotated full-width bar (intentional CTA row)', () => {
    const input = '<div style="background:#99E885;border:4px solid #000;padding:22px 36px">① 14일 무료 체험 신청</div>';
    const out = normalizeRotatedInlinePills(input);
    expect(out).toBe(input);
  });

  it('does NOT touch a rotated element without pill markers (background + border + padding)', () => {
    const input = '<div style="transform:rotate(15deg);font-size:20px">가벼운 텍스트</div>';
    const out = normalizeRotatedInlinePills(input);
    expect(out).toBe(input);
  });

  it('does NOT touch a long rotated paragraph (> 120 chars leaf text)', () => {
    const input = `<div style="padding:20px;background:#FFFDF5;border:4px solid #000;transform:rotate(2deg)">${'a'.repeat(200)}</div>`;
    const out = normalizeRotatedInlinePills(input);
    expect(out).toBe(input);
  });

  it('is idempotent — running twice does not append the style repeatedly', () => {
    const input = '<div style="padding:14px 22px;background:#FE90E8;border:4px solid #000;transform:rotate(4deg)">TAG</div>';
    const once = normalizeRotatedInlinePills(input);
    const twice = normalizeRotatedInlinePills(once);
    expect(twice).toBe(once);
    expect((once.match(/display:inline-block/g) ?? []).length).toBe(1);
  });

  it('salvageMalformedMiniMaxSlideMarkup end-to-end fixes the OVERVIEW pill on the user fixture', () => {
    const input = '<!doctype html><html><body>'
      + '<section class="slide" data-screen-label="02 Overview">'
      + '<div data-od-slide-flow>'
      + '<div style="padding:14px 22px;background:#FE90E8;border:4px solid #000;box-shadow:6px 6px 0 #000;font-family:\'Space Grotesk\',monospace;font-size:16px;font-weight:700;transform:rotate(4deg)">OVERVIEW</div>'
      + '<h2>Teamver, 한 줄 정의.</h2>'
      + '<p>정의 본문</p>'
      + '</div></section>'
      + '</body></html>';
    const salv = salvageMalformedMiniMaxSlideMarkup(input, 'brief');
    // The OVERVIEW pill now carries the inline-block + fit-content style.
    expect(salv).toMatch(/OVERVIEW/);
    const pillMatch = salv.match(/<div[^>]*transform:rotate\(4deg\)[^>]*>OVERVIEW<\/div>/);
    expect(pillMatch).not.toBeNull();
    expect(pillMatch![0]).toContain('display:inline-block');
    expect(pillMatch![0]).toContain('width:fit-content');
  });

  it('salvage stays idempotent even after normalizeRotatedInlinePills fires', () => {
    const input = '<!doctype html><html><body>'
      + '<section class="slide" data-screen-label="02"><div>'
      + '<div style="padding:14px 22px;background:#FE90E8;border:4px solid #000;transform:rotate(4deg)">OVERVIEW</div>'
      + '<h2>Header</h2><p>Body</p>'
      + '</div></section></body></html>';
    const once = salvageMalformedMiniMaxSlideMarkup(input, 'brief');
    const twice = salvageMalformedMiniMaxSlideMarkup(once, 'brief');
    expect(twice).toBe(once);
  });
});
