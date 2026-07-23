// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

// Behavioral coverage for nexu-io/open-design#1530. The deck bridge in
// `buildSrcdoc({ deck: true })` counts slides via a DOM selector to drive
// the host preview toolbar's `slideState.count`. Generated HTML decks
// commonly nest `.slide` elements under an extra wrapper rather than
// placing them as direct children of the structured containers the bridge
// recognised (`.deck`, `.deck-stage`, `.deck-shell`, `body`). When that
// happened the bridge reported `count: 0` and the toolbar showed `1 / 0`
// even though the deck visibly contained slides and its own keyboard
// handler navigated them — the host counter did not match what the user
// saw. The fix keeps the structured selector first (so decorative
// `.slide` markup in non-deck pages is not accidentally counted) and
// falls back to all `.slide` only when the structured count is zero.

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match || !match[1]) {
    throw new Error('deck bridge script not found in srcdoc');
  }
  return match[1];
}

function setupDeckBridge(bodyHtml: string) {
  const srcdoc = buildSrcdoc(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    deck: true,
  });
  const script = extractDeckBridgeScript(srcdoc);
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const parentPostMessage = vi.fn();
  // jsdom defaults `window.parent` to `window` itself for top-level
  // documents; replace it with a stub that has a spied postMessage so
  // we can observe what the bridge would send to the embedding host.
  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: { postMessage: parentPostMessage },
  });
  const evaluate = new win.Function(script);
  evaluate.call(win);
  // jsdom fires `load` during construction, before the bridge IIFE
  // installs its listener. Replay it here so the test exercises the
  // same first-paint `report()` path the real preview iframe takes —
  // without this the only postMessage we'd capture would come from the
  // MutationObserver path inside `observeSlides`, which never fires
  // when the structured selector is empty (the pre-fix bug condition).
  win.dispatchEvent(new win.Event('load'));
  return { dom, win, parentPostMessage };
}

function lastSlideState(parentPostMessage: ReturnType<typeof vi.fn>) {
  const messages = parentPostMessage.mock.calls
    .map((call) => call[0])
    .filter((m) => m?.type === 'od:slide-state');
  return messages.at(-1);
}

function postSlide(win: ReturnType<typeof setupDeckBridge>['win'], action: 'next' | 'prev') {
  win.dispatchEvent(new win.window.MessageEvent('message', {
    data: { type: 'od:slide', action },
  }));
}

describe('deck bridge — nested slide markup (#1530)', () => {
  it('counts nested .slide elements through a fallback when no structured container matches', async () => {
    // 8 slides nested two levels deep — none of `.deck > .slide`,
    // `.deck-stage > .slide`, `.deck-shell > .slide`, or `body > .slide`
    // matches them. The bridge must still count 8 so the host renders
    // `1 / 8` instead of the user-reported `1 / 0`.
    const slides = Array.from({ length: 8 }, (_, i) =>
      `<section class="slide">Slide ${i + 1}</section>`,
    ).join('');
    const { win, parentPostMessage } = setupDeckBridge(
      `<div class="deck-wrap"><div class="deck-inner">${slides}</div></div>`,
    );
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    const state = lastSlideState(parentPostMessage);
    expect(state).toBeDefined();
    expect(state.count).toBe(8);
  });

  it('still counts slides under the documented containers as direct children and ignores decorative .slide markup outside them', async () => {
    // Pin the structured-first contract: direct children of `.deck` /
    // `.deck-stage` / `.deck-shell` / `body` keep working as before AND
    // decorative `.slide` markup placed outside any structured container
    // (e.g. a utility class on a banner graphic) is not pulled in just
    // because it shares the class name. Without the structured-first
    // pass a broad `.slide` selector would count 4 here, so this fixture
    // pins the precedence directly rather than only by docstring.
    const slides = Array.from({ length: 3 }, (_, i) =>
      `<section class="slide">${i}</section>`,
    ).join('');
    const { win, parentPostMessage } = setupDeckBridge(
      `<header><span class="slide" aria-hidden="true">decoy</span></header><div class="deck">${slides}</div>`,
    );
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    const state = lastSlideState(parentPostMessage);
    expect(state).toBeDefined();
    expect(state.count).toBe(3);
  });

  it('advances transform-track decks that do not expose active classes or scroll state', async () => {
    const { win, parentPostMessage } = setupDeckBridge(`
      <style>
        html, body { margin: 0; overflow: hidden; }
        #deck { display: flex; width: 300vw; transform: translateX(0); }
        .slide { flex: 0 0 100vw; width: 100vw; height: 100vh; }
      </style>
      <div id="deck">
        <section class="slide">One</section>
        <section class="slide">Two</section>
        <section class="slide">Three</section>
      </div>
    `);
    const deck = win.document.getElementById('deck') as HTMLElement;

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    expect(deck.style.transform).toBe('translateX(-100vw)');
    const state = lastSlideState(parentPostMessage);
    expect(state).toMatchObject({ active: 1, count: 3 });
  });

  it('does not double-advance decks that listen for keyboard navigation on both window and document', async () => {
    const { win, parentPostMessage } = setupDeckBridge(`
      <section class="slide active">One</section>
      <section class="slide">Two</section>
      <section class="slide">Three</section>
      <section class="slide">Four</section>
    `);
    const slides = Array.from(win.document.querySelectorAll('.slide'));
    let active = 0;
    function paint() {
      slides.forEach((slide, index) => {
        slide.classList.toggle('active', index === active);
      });
    }
    function go(index: number) {
      active = Math.max(0, Math.min(slides.length - 1, index));
      paint();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') go(active + 1);
      else if (event.key === 'ArrowLeft') go(active - 1);
    }
    win.addEventListener('keydown', onKey, true);
    win.document.addEventListener('keydown', onKey, true);
    paint();

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    const activeSlide = Array.from(win.document.querySelectorAll('.slide'))
      .findIndex((slide) => slide.classList.contains('active'));
    expect(activeSlide).toBe(1);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 4 });
  });

  it('scrolls documentElement when body looks horizontally scrollable in a sandboxed Simple Deck', async () => {
    const { win, parentPostMessage } = setupDeckBridge(`
      <style>
        html, body { margin: 0; height: 100%; }
        body { display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; }
        .slide { flex: 0 0 100vw; width: 100vw; height: 100vh; scroll-snap-align: start; }
      </style>
      <section class="slide">One</section>
      <section class="slide">Two</section>
      <section class="slide">Three</section>
    `);
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperties(win.document.body, {
      scrollWidth: { configurable: true, value: 3000 },
      clientWidth: { configurable: true, value: 1000 },
    });
    Object.defineProperties(win.document.documentElement, {
      scrollWidth: { configurable: true, value: 3000 },
      clientWidth: { configurable: true, value: 1000 },
    });
    const bodyScrollTo = vi.fn();
    const htmlScrollTo = vi.fn((options?: ScrollToOptions | number) => {
      const left = typeof options === 'number' ? options : Number(options?.left || 0);
      win.document.documentElement.scrollLeft = left;
    });
    win.document.body.scrollTo = bodyScrollTo;
    win.document.documentElement.scrollTo = htmlScrollTo;

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 450));

    expect(bodyScrollTo).toHaveBeenCalledWith({ left: 1000, behavior: 'smooth' });
    expect(htmlScrollTo).toHaveBeenCalledWith({ left: 1000, behavior: 'smooth' });
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });

  it('updates Simple Deck direct progress fill when host navigation drives the slide', async () => {
    const { win } = setupDeckBridge(`
      <style>
        html, body { margin: 0; height: 100%; }
        body { display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; }
        .slide { flex: 0 0 100vw; width: 100vw; height: 100vh; scroll-snap-align: start; }
        .deck-progress { position: fixed; top: 0; left: 0; height: 3px; width: 0; }
      </style>
      <section class="slide">One</section>
      <section class="slide">Two</section>
      <section class="slide">Three</section>
      <div class="deck-progress" id="deck-progress" aria-hidden></div>
    `);
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperties(win.document.body, {
      scrollWidth: { configurable: true, value: 3000 },
      clientWidth: { configurable: true, value: 1000 },
    });
    Object.defineProperties(win.document.documentElement, {
      scrollWidth: { configurable: true, value: 3000 },
      clientWidth: { configurable: true, value: 1000 },
    });
    win.document.body.scrollTo = vi.fn();
    win.document.documentElement.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
      const left = typeof options === 'number' ? options : Number(options?.left || 0);
      win.document.documentElement.scrollLeft = left;
    });

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 450));

    expect((win.document.getElementById('deck-progress') as HTMLElement).style.width).toBe('66.66666666666666%');
  });

  it('reveals one stacked section.slide at a time for freeform min-height decks', async () => {
    const slides = Array.from({ length: 3 }, (_, i) =>
      `<section class="slide" style="min-height:100vh;padding:40px">Slide ${i + 1}</section>`,
    ).join('');
    const { win, parentPostMessage } = setupDeckBridge(slides);
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    const slideEls = Array.from(win.document.querySelectorAll('.slide')) as HTMLElement[];
    expect(slideEls.filter((el) => el.style.display !== 'none').length).toBe(1);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 0, count: 3 });

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    expect(slideEls[1]?.style.display).not.toBe('none');
    expect(slideEls[0]?.style.display).toBe('none');
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });

  it('letterboxes body > .slide min-height decks to a centered 1920x1080 stage', async () => {
    const slides = Array.from({ length: 2 }, (_, i) =>
      `<section class="slide" style="min-height:100vh;background:#0ea5e9;padding:40px">Slide ${i + 1}</section>`,
    ).join('');
    const { win } = setupDeckBridge(slides);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 800, height: 600, scale: 1, layoutFit: false },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 450));

    const stage = win.document.getElementById('od-stacked-deck-stage');
    expect(stage).toBeTruthy();
    expect(win.document.documentElement.getAttribute('data-od-stacked-deck')).toBe('');
    expect(stage?.style.transform).toMatch(/scale\(|translate\(/);
    const scaleMatch = stage?.style.transform?.match(/scale\(([\d.]+)\)/);
    expect(scaleMatch).toBeTruthy();
    const fitScale = Number(scaleMatch?.[1] ?? 0);
    expect(fitScale).toBeGreaterThan(0.35);
    expect(fitScale).toBeLessThan(0.45);
    const slideEls = Array.from(win.document.querySelectorAll('#od-stacked-deck-stage > .slide')) as HTMLElement[];
    expect(slideEls).toHaveLength(2);
    expect(slideEls.filter((el) => el.style.display !== 'none')).toHaveLength(1);
  });

  it('accumulates deck pan offsets via od:preview-scroll-by and resets on slide change', async () => {
    const slides = Array.from({ length: 2 }, (_, i) =>
      `<section class="slide" style="min-height:100vh;background:#0ea5e9">Slide ${i + 1}</section>`,
    ).join('');
    const { win } = setupDeckBridge(slides);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 800, height: 600, scale: 1, layoutFit: false },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 450));

    const stage = win.document.getElementById('od-stacked-deck-stage');
    expect(stage?.style.transform).toBeTruthy();
    const centered = stage?.style.transform ?? '';

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:preview-scroll-by', left: 40, top: -20 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 50));
    expect(stage?.style.transform).not.toBe(centered);
    expect(stage?.style.transform).toContain('translate(');

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-pan-reset' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 50));
    expect(stage?.style.transform).toBe(centered);

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:preview-scroll-by', left: 12, top: 8 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 50));
    const panned = stage?.style.transform ?? '';
    expect(panned).not.toBe(centered);

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 400));
    expect(stage?.style.transform).toBe(centered);
  });

  it('host next/prev changes computed visibility after stacked stage letterbox wraps slides', async () => {
    const slides = Array.from({ length: 3 }, (_, i) =>
      `<section class="slide" style="min-height:100vh;padding:40px">Slide ${i + 1}</section>`,
    ).join('');
    const { win, parentPostMessage } = setupDeckBridge(slides);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 800, height: 600, scale: 1, layoutFit: false },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 450));

    const slideEls = Array.from(
      win.document.querySelectorAll('#od-stacked-deck-stage > .slide'),
    ) as HTMLElement[];
    expect(slideEls).toHaveLength(3);
    expect(win.getComputedStyle(slideEls[0]!).display).not.toBe('none');
    expect(win.getComputedStyle(slideEls[1]!).display).toBe('none');
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 0, count: 3 });

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    expect(win.getComputedStyle(slideEls[0]!).display).toBe('none');
    expect(win.getComputedStyle(slideEls[1]!).display).not.toBe('none');
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });

    postSlide(win, 'prev');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    expect(win.getComputedStyle(slideEls[0]!).display).not.toBe('none');
    expect(win.getComputedStyle(slideEls[1]!).display).toBe('none');
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 0, count: 3 });
  });
});
