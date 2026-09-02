// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

const repoRoot = resolve(import.meta.dirname, '../../../..');

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match || !match[1]) {
    throw new Error('deck bridge script not found in srcdoc');
  }
  return match[1];
}

function assertNoFirstPageNudge(win: Window & typeof globalThis, parentPostMessage: ReturnType<typeof vi.fn>) {
  const painted = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
  const visible = painted.filter((slide) => slide.style.display !== 'none');
  expect(visible.some((slide) => slide.textContent?.includes('Page two'))).toBe(true);
  expect(visible.every((slide) => !slide.textContent?.includes('Page one'))).toBe(true);
  const liveStage = win.document.getElementById('stage');
  if (liveStage) {
    expect(liveStage.style.transform || '').not.toMatch(/translateX\(\s*-?(?:100vw|1920px)\s*\)/);
  }
  expect(win.document.documentElement.scrollLeft || 0).toBe(0);
  const slideStates = parentPostMessage.mock.calls
    .map((call) => call[0])
    .filter((message) => message?.type === 'od:slide-state');
  expect(slideStates.at(-1)).toMatchObject({ active: 1 });
}

async function hostNextOnLeftover(html: string) {
  const srcdoc = buildSrcdoc(html, { deck: true });
  const script = extractDeckBridgeScript(srcdoc);
  const dom = new JSDOM(srcdoc, { runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  const parentPostMessage = vi.fn();
  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: { postMessage: parentPostMessage },
  });
  Object.defineProperty(win, 'innerWidth', { configurable: true, value: 800 });
  Object.defineProperty(win, 'innerHeight', { configurable: true, value: 600 });
  const stage = win.document.getElementById('stage') as HTMLElement | null;
  const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
  expect(slides.length).toBeGreaterThanOrEqual(2);
  slides.forEach((slide, index) => {
    const wide = /1920px/.test(slide.getAttribute('style') || '')
      || !!win.document.querySelector('[data-teamver-template-clone-size]');
    Object.defineProperty(slide, 'offsetWidth', { configurable: true, value: wide ? 1920 : 800 });
    Object.defineProperty(slide, 'offsetHeight', { configurable: true, value: wide ? 1080 : 600 });
    Object.defineProperty(slide, 'offsetLeft', { configurable: true, value: 0 });
    Object.defineProperty(slide, 'offsetTop', { configurable: true, value: index * (wide ? 1080 : 600) });
  });
  if (stage) {
    Object.defineProperty(stage, 'scrollWidth', { configurable: true, value: 2400 });
    Object.defineProperty(stage, 'offsetWidth', { configurable: true, value: 800 });
  }
  new win.Function(script).call(win);
  win.dispatchEvent(new win.Event('load'));
  win.dispatchEvent(new win.MessageEvent('message', {
    data: { type: 'od:deck-host-viewport', width: 800, height: 600, scale: 1, layoutFit: false },
  }));
  await new Promise<void>((resolve) => win.setTimeout(resolve, 260));
  win.dispatchEvent(new win.MessageEvent('message', {
    data: { type: 'od:slide', action: 'next' },
  }));
  await new Promise<void>((resolve) => win.setTimeout(resolve, 120));
  return { win, parentPostMessage, srcdoc };
}

describe('leftover host-nav invariant', () => {
  it('pins leftoverHostNavMustPaintByDisplay before transformGo in go() and gotoIndex()', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../../src/runtime/srcdoc.ts'), 'utf8');
    const goStart = source.indexOf('function go(action)');
    const gotoStart = source.indexOf('function gotoIndex(i)');
    expect(goStart).toBeGreaterThan(0);
    expect(gotoStart).toBeGreaterThan(goStart);
    const goBody = source.slice(goStart, gotoStart);
    const gotoBody = source.slice(gotoStart, source.indexOf('function report(', gotoStart));
    const goInvariant = goBody.indexOf('leftoverHostNavMustPaintByDisplay(list) && forceRevealSlide(target)');
    const goTransform = goBody.indexOf('isHorizontalStageTrack(pxTrack) && transformGo(target)');
    const gotoInvariant = gotoBody.indexOf('leftoverHostNavMustPaintByDisplay(list) && forceRevealSlide(target)');
    const gotoTransform = gotoBody.indexOf('isHorizontalStageTrack(pxTrackGo) && transformGo(target)');
    expect(goInvariant).toBeGreaterThan(0);
    expect(goTransform).toBeGreaterThan(goInvariant);
    expect(gotoInvariant).toBeGreaterThan(0);
    expect(gotoTransform).toBeGreaterThan(gotoInvariant);
  });

  it('paints slide 2 on clone-size leftover #stage without inline 1920', async () => {
    const html = `<!doctype html><html><head>
<style data-teamver-template-clone-size>
  html, body { margin: 0; height: 100%; overflow: hidden; }
  #stage { display: flex; }
  .slide { min-width: 100vw; height: 100vh; box-sizing: border-box; }
</style>
</head><body>
<div class="stage" id="stage">
  <section class="slide">Page one topic</section>
  <section class="slide">Page two topic</section>
  <section class="slide">Page three topic</section>
</div>
<script>
  (function () {
    var stage = document.getElementById('stage');
    var i = 0;
    window.go = function () {
      i += 1;
      if (stage) stage.style.transform = 'translateX(-' + (i * 100) + 'vw)';
    };
  })();
</script>
</body></html>`;
    const { win, parentPostMessage } = await hostNextOnLeftover(html);
    assertNoFirstPageNudge(win, parentPostMessage);
  });

  it('paints slide 2 when leftover #stage still has non-empty deco residue hoist refuses', async () => {
    const html = `<!doctype html><html><head>
<style data-teamver-template-clone-size>
  html, body { margin: 0; height: 100%; overflow: hidden; }
  #stage { display: flex; }
</style>
</head><body>
<div class="stage" id="stage">
  <div class="watermark" aria-hidden="true">·</div>
  <section class="slide" style="width:1920px;height:1080px">Page one topic</section>
  <section class="slide" style="width:1920px;height:1080px">Page two topic</section>
</div>
<script>
  (function () {
    var stage = document.getElementById('stage');
    var i = 0;
    window.go = function () {
      i += 1;
      if (stage) stage.style.transform = 'translateX(-' + (i * 1920) + 'px)';
    };
  })();
</script>
</body></html>`;
    const { win, parentPostMessage } = await hostNextOnLeftover(html);
    assertNoFirstPageNudge(win, parentPostMessage);
  });

  it('keeps official IB example.html #stage so native swipe still owns paging', async () => {
    const html = await readFile(
      resolve(repoRoot, 'plugins/_official/examples/ib-pitch-book/example.html'),
      'utf8',
    );
    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).toMatch(/<div\b[^>]*\bid\s*=\s*["']stage["']/i);
    expect(srcdoc).not.toContain('compactStackedDeckEnabled = true');
  });
});
