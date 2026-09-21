// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import { listDeckFilmstripItems } from '../../src/artifacts/deck-patch';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

/**
 * Structural minimum of the reported cover deck: `div.slide` (not section),
 * 1-based `data-slide="1"`, opacity stack, clone-size pin, and a missing
 * slide-2 wrapper whose extra `</div>` closes `.presentation` early.
 */
const COVER_OPACITY_DECK = `<!doctype html><html><head>
<style data-teamver-template-clone-size>
  html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; }
  .slide { position: absolute; inset: 0; width: 100%; height: 100%; display: flex; opacity: 0; pointer-events: none; }
  .slide.active { opacity: 1; pointer-events: all; }
  .nav-dots, .nav-dot { display: none; }
</style>
</head><body>
<div class="grain-overlay"></div>
<div class="presentation">
  <div class="slide slide-1 active" data-slide="1" style="width:1920px;height:1080px;box-sizing:border-box">
    <div class="title-pill">OVERVIEW</div>
    <h1 class="main-title">Teamver 소개</h1>
  </div>
  <h2>Teamver 소개 2</h2>
  <p>Teamver가 풀어야 하는 문제</p>
  </div>
  <div class="right-visual"><div class="orbit-center">01</div></div>
  </div></div>
  <div class="slide slide-3" data-slide="3" style="width:1920px;height:1080px;box-sizing:border-box">
    <h2>개요</h2>
  </div>
  <div class="slide slide-4" data-slide="4" style="width:1920px;height:1080px;box-sizing:border-box">
    <h2>다음</h2>
  </div>
</div>
</body></html>`;

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('deck bridge script not found');
  return match[1];
}

describe('cover page stays visible in the page view', () => {
  it('lists the div cover in the filmstrip even when data-slide is 1-based', () => {
    const items = listDeckFilmstripItems(COVER_OPACITY_DECK);
    expect(items[0]).toMatchObject({ index: 0, label: 'Teamver 소개' });
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('paints the cover on go(0) after a broken extra close leaks later pages to body', async () => {
    const srcdoc = buildSrcdoc(COVER_OPACITY_DECK, { deck: true, initialSlideIndex: 0 });
    const script = extractDeckBridgeScript(srcdoc);
    const dom = new JSDOM(srcdoc, { runScripts: 'outside-only', pretendToBeVisual: true });
    const win = dom.window;
    const parentPostMessage = vi.fn();
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: parentPostMessage },
    });
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 960 });
    Object.defineProperty(win, 'innerHeight', { configurable: true, value: 540 });
    new win.Function(script).call(win);
    win.dispatchEvent(new win.Event('load'));
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 960, height: 540, scale: 0.5, layoutFit: true },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 250));
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'go', index: 0 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 40));

    const bridge = (win as unknown as { __odDeckSlideState?: () => { active: number; count: number } })
      .__odDeckSlideState?.();
    const stage = win.document.getElementById('od-stacked-deck-stage');
    const stageSlides = stage
      ? Array.from(stage.querySelectorAll(':scope > .slide'))
      : [];
    const painted = Array.from(win.document.querySelectorAll('.slide')).filter((el) => {
      const display = (el as HTMLElement).style.display;
      return el.classList.contains('active') && display !== 'none';
    });

    expect(bridge?.active).toBe(0);
    expect(bridge?.count).toBeGreaterThanOrEqual(3);
    expect(stageSlides[0]?.textContent).toContain('Teamver 소개');
    expect(painted.some((el) => el.textContent?.includes('Teamver 소개'))).toBe(true);
    expect(painted.every((el) => !el.textContent?.includes('개요'))).toBe(true);
  });
});
