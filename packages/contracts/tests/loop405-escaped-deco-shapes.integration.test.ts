import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  reparentEscapedDecoIntoSlideFlow,
  salvageMalformedMiniMaxSlideMarkup,
} from '../src/template-clone-fill.js';

/**
 * User report 2026-09-03 (slide 2 of "Neural Studio 회사 소개" deck): ad-hoc
 * decorative shapes — pink and blue rotated rectangles above the slide,
 * a yellow rectangle at bottom-left, and a purple circle at bottom-right
 * — were painting in the DARK LETTERBOX area outside the slide's
 * 1920×1080 canvas. Root cause: the canvas-pin CSS intentionally keeps
 * `.slide { overflow: visible }` so Motif chrome can hang outside the
 * box; the same rule lets non-motif absolute-positioned shape divs
 * escape into the letterbox.
 *
 * Loop406 fix — `reparentEscapedDecoIntoSlideFlow` walks each slide,
 * finds ad-hoc decorative shape divs that sit as siblings of
 * `[data-od-slide-flow]` (not Motif, not `.pill/.stamp/.ribbon/.corner-
 * bracket/.starfield/...`), and prepends them into the flow wrapper so
 * its `overflow: hidden` clips them to the slide boundary.
 *
 *   Shape stays at `position:absolute; top:-40px; right:60px; …`
 *   Original visual placement is preserved (flow wrapper is `inset:0`)
 *   Only the letterbox leak is eliminated
 *
 * Motif chrome (`[data-od-official-motif-html]`, `.deco-*`, `.pill`,
 * `.stamp`, `.ribbon`, `.corner-bracket`, `.starfield`, `.scanlines`,
 * `.grain`, `.crt-glow`, `.bg-grid`, `.sunglow`, `.cover-blob`,
 * `.pixel-*`, `.hc-*`, `.gd-orb`, `.xp-blob`, `.post-it`,
 * `.floating-pills`, `.petals`, …) stays outside the flow by design.
 */
const FIXTURE_PATH = join(
  __dirname,
  'fixtures',
  'loop405-escaped-deco-shapes.html',
);
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf8');

describe('loop406 — escaped decorative shape reparent', () => {
  it('reparents non-motif absolute shapes into [data-od-slide-flow] on the user-report fixture', () => {
    const out = reparentEscapedDecoIntoSlideFlow(FIXTURE_HTML);
    expect(out).not.toBe(FIXTURE_HTML);
    // The 4 ad-hoc shapes (pink, blue, yellow, purple circle) are all now
    // inside the flow wrapper of slide 2.
    const flowInner = out.match(/<div data-od-slide-flow[^>]*>([\s\S]*?)<\/div>\s*<div class="deco-pink-rect"/)?.[1] ?? '';
    // If the trailing motif-classed pink-rect stayed OUTSIDE the flow, the
    // regex above finds the flow immediately preceding it. The flow inner
    // must now contain the 4 escaped shapes.
    expect(flowInner).toMatch(/background:#F5B5CA/); // pink rect
    expect(flowInner).toMatch(/background:#B8D8E8/); // blue rect
    expect(flowInner).toMatch(/background:#D4C86A/); // yellow rect
    expect(flowInner).toMatch(/background:#8B7AC8/); // purple circle
    // The motif-classed `deco-pink-rect` stays OUTSIDE the flow (unchanged).
    expect(out).toMatch(/<div class="deco-pink-rect"/);
  });

  it('preserves the motif-classed deco-pink-rect as a slide sibling (not reparented)', () => {
    const out = reparentEscapedDecoIntoSlideFlow(FIXTURE_HTML);
    // deco-pink-rect must appear AFTER </div> that closes the flow wrapper,
    // not inside the flow.
    const flowClose = out.indexOf('</div>\n  <div class="deco-pink-rect"');
    expect(flowClose).toBeGreaterThan(-1);
  });

  it('idempotent — running twice produces the same output', () => {
    const once = reparentEscapedDecoIntoSlideFlow(FIXTURE_HTML);
    const twice = reparentEscapedDecoIntoSlideFlow(once);
    expect(twice).toBe(once);
  });

  it('is a no-op when a slide has no [data-od-slide-flow] wrapper', () => {
    const input = '<!doctype html><html><body>'
      + '<section class="slide">'
      + '<div style="position:absolute;top:-40px;background:pink;width:120px;height:80px"></div>'
      + '<h2>Direct-child heading</h2>'
      + '</section></body></html>';
    const out = reparentEscapedDecoIntoSlideFlow(input);
    expect(out).toBe(input);
  });

  it('skips a rotated shape that has NO background paint (border-only overlay)', () => {
    const input = '<!doctype html><html><body>'
      + '<section class="slide">'
      + '<div style="position:absolute;top:0;left:0;width:50px;height:50px;border:3px solid #000;transform:rotate(4deg)"></div>'
      + '<div data-od-slide-flow><h2>Title</h2></div>'
      + '</section></body></html>';
    const out = reparentEscapedDecoIntoSlideFlow(input);
    expect(out).toBe(input);
  });

  it('skips a shape whose inner leaf text is > 40 chars (probably real content, not deco)', () => {
    const input = '<!doctype html><html><body>'
      + '<section class="slide">'
      + '<div style="position:absolute;top:0;left:0;background:#333">This is a very long text label that is clearly not a decorative shape, so leave it.</div>'
      + '<div data-od-slide-flow><h2>Title</h2></div>'
      + '</section></body></html>';
    const out = reparentEscapedDecoIntoSlideFlow(input);
    expect(out).toBe(input);
  });

  it('skips shapes with recognized motif/deco/pill/stamp/ribbon/corner-bracket class names', () => {
    const input = '<!doctype html><html><body>'
      + '<section class="slide">'
      + '<div class="deco-yellow-bar" style="position:absolute;bottom:0;left:80px;background:yellow;width:140px;height:36px"></div>'
      + '<div class="pill" style="position:absolute;top:20px;left:20px;background:cyan;width:80px;height:30px">TAG</div>'
      + '<div class="corner-bracket" style="position:absolute;top:0;right:0;width:24px;height:24px;background:#000"></div>'
      + '<div data-od-slide-flow><h2>Title</h2></div>'
      + '</section></body></html>';
    const out = reparentEscapedDecoIntoSlideFlow(input);
    expect(out).toBe(input);
  });

  it('salvageMalformedMiniMaxSlideMarkup end-to-end applies the reparent on the fixture', () => {
    const salv = salvageMalformedMiniMaxSlideMarkup(FIXTURE_HTML, 'brief');
    const flowInner = salv.match(/<div data-od-slide-flow[^>]*>([\s\S]*?)<\/div>\s*<div class="deco-pink-rect"/)?.[1] ?? '';
    expect(flowInner).toMatch(/background:#F5B5CA/);
    expect(flowInner).toMatch(/background:#B8D8E8/);
    expect(flowInner).toMatch(/background:#D4C86A/);
    expect(flowInner).toMatch(/background:#8B7AC8/);
    // Content survives.
    expect(salv).toMatch(/Neural Studio는 LLM RAG/);
    expect(salv).toMatch(/Applied AI Research/);
  });

  it('salvage is idempotent — repeated salvage matches the first output', () => {
    const once = salvageMalformedMiniMaxSlideMarkup(FIXTURE_HTML, 'brief');
    const twice = salvageMalformedMiniMaxSlideMarkup(once, 'brief');
    expect(twice).toBe(once);
  });
});
