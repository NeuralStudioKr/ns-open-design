// @vitest-environment node
/**
 * 루프382 — compact stacked bootstrap must not snap back to slide 0 after the
 * host already navigated. Prompt-fill body-first N-slide decks enter compact
 * mode; a 400ms ready retry used to forceReveal(initial=0) and made 9-slide
 * decks look like a single page.
 */
import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('deck bridge script not found');
  return match[1];
}

function bodyFirstNineSlideDeck(): string {
  const slides = Array.from({ length: 9 }, (_, i) => (
    `<section class="slide" style="width:1920px;height:1080px;box-sizing:border-box;background:#FFDC8B">`
    + `<h1>Page ${i + 1}</h1></section>`
  )).join('');
  return [
    '<!doctype html><html><head>',
    '<style data-teamver-template-clone-size="">',
    'html,body{margin:0}.slide{width:1920px;height:1080px}',
    '</style>',
    '</head><body>',
    slides,
    '</body></html>',
  ].join('');
}

describe('compact bootstrap holds host navigation (루프383)', () => {
  it('keeps active=1 after next even when 400ms bootstrap retries before ready', async () => {
    const srcdoc = buildSrcdoc(bodyFirstNineSlideDeck(), { deck: true });
    expect(srcdoc).toContain('compactStackedDeckEnabled = true');
    expect(srcdoc).toContain('hostSlideNavigationSeen');

    const script = extractDeckBridgeScript(srcdoc);
    const dom = new JSDOM(srcdoc, { runScripts: 'outside-only', pretendToBeVisual: true });
    const win = dom.window as Window & typeof globalThis & {
      setTimeout: typeof setTimeout;
    };
    const parentPostMessage = vi.fn();
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: parentPostMessage },
    });
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(win, 'innerHeight', { configurable: true, value: 450 });

    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
    expect(slides.length).toBe(9);
    slides.forEach((slide, index) => {
      Object.defineProperty(slide, 'offsetWidth', { configurable: true, value: 1920 });
      Object.defineProperty(slide, 'offsetHeight', { configurable: true, value: 1080 });
      Object.defineProperty(slide, 'offsetLeft', { configurable: true, value: 0 });
      Object.defineProperty(slide, 'offsetTop', { configurable: true, value: index * 1080 });
    });

    new win.Function(script).call(win);
    win.dispatchEvent(new win.Event('load'));
    // Intentionally omit od:deck-host-viewport so data-od-stacked-deck-ready
    // stays unset and the 400ms bootstrap retry still runs.
    await new Promise<void>((resolve) => win.setTimeout(resolve, 50));

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 80));

    const midStates = parentPostMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message?.type === 'od:slide-state');
    expect(midStates.at(-1)).toMatchObject({ active: 1, count: 9 });

    // Past the 400ms bootstrapCompactStackedDeck retry.
    await new Promise<void>((resolve) => win.setTimeout(resolve, 450));

    const lateStates = parentPostMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message?.type === 'od:slide-state');
    expect(lateStates.at(-1)).toMatchObject({ active: 1, count: 9 });

    const visible = slides.filter((slide) => slide.style.display !== 'none');
    expect(visible.some((slide) => slide.textContent?.includes('Page 2'))).toBe(true);
    expect(visible.every((slide) => !slide.textContent?.includes('Page 1'))).toBe(true);
  });
});
