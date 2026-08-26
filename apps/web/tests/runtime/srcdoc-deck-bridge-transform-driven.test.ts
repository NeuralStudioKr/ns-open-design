// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match || !match[1]) {
    throw new Error('deck bridge script not found in srcdoc');
  }
  return match[1];
}

function setupTransformDeck() {
  const bodyHtml = `
    <style>
      html, body { margin: 0; }
      body { overflow-x: hidden; }
      .deck-shell { width: 100vw; overflow: hidden; }
      .deck-track { display: flex; width: 300vw; }
      .slide { flex: 0 0 100vw; }
    </style>
    <div class="deck-shell">
      <div class="deck-track" id="deck-track">
        <section class="slide active">One</section>
        <section class="slide">Two</section>
        <section class="slide">Three</section>
      </div>
    </div>
  `;
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
  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: { postMessage: parentPostMessage },
  });
  Object.defineProperty(win, 'innerWidth', {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(win.document.body, 'scrollWidth', {
    configurable: true,
    value: 3000,
  });
  Object.defineProperty(win.document.body, 'clientWidth', {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(win.document.documentElement, 'scrollWidth', {
    configurable: true,
    value: 3000,
  });
  Object.defineProperty(win.document.documentElement, 'clientWidth', {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(win.document, 'scrollingElement', {
    configurable: true,
    value: win.document.documentElement,
  });
  let bodyScrollLeft = 0;
  let documentScrollLeft = 0;
  Object.defineProperty(win.document.body, 'scrollLeft', {
    configurable: true,
    get: () => bodyScrollLeft,
    set: (value: number) => {
      bodyScrollLeft = value;
    },
  });
  Object.defineProperty(win.document.documentElement, 'scrollLeft', {
    configurable: true,
    get: () => documentScrollLeft,
    set: (value: number) => {
      documentScrollLeft = value;
    },
  });
  Object.defineProperty(win.document.body, 'scrollTo', {
    configurable: true,
    value: ({ left }: { left?: number }) => {
      if (typeof left === 'number') {
        bodyScrollLeft = left;
      }
    },
  });
  Object.defineProperty(win.document.documentElement, 'scrollTo', {
    configurable: true,
    value: ({ left }: { left?: number }) => {
      if (typeof left === 'number') {
        documentScrollLeft = left;
      }
    },
  });

  const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
  const track = win.document.getElementById('deck-track') as HTMLElement;
  let active = 0;
  function apply(index: number) {
    active = Math.max(0, Math.min(slides.length - 1, index));
    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === active);
    });
    track.style.transform = `translateX(-${active * 100}vw)`;
  }
  win.document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') apply(active + 1);
    else if (event.key === 'ArrowLeft') apply(active - 1);
    else if (event.key === 'Home') apply(0);
    else if (event.key === 'End') apply(slides.length - 1);
  });
  apply(0);

  const evaluate = new win.Function(script);
  evaluate.call(win);
  return { win, parentPostMessage, track };
}

describe('deck bridge - transform-driven decks', () => {
  it('keeps vertical translateY tracks on the Y axis (8-Bit Orbit)', async () => {
    const bodyHtml = `
      <style>
        html, body { margin: 0; height: 100%; overflow: hidden; background: #0A0E27; }
        .deck { width: 100%; height: 100vh; overflow: hidden; position: relative; }
        .slides-container { width: 100%; height: 100%; }
        .slide { width: 100%; height: 100vh; }
      </style>
      <div class="deck" id="deck">
        <div class="slide-counter" id="slideCounter">01 / 03</div>
        <div class="slides-container" id="slidesContainer">
          <section class="slide">One</section>
          <section class="slide">Two</section>
          <section class="slide">Three</section>
        </div>
      </div>
      <script>container.style.transform = \`translateY(-\${currentSlide * 100}vh)\`;</script>
    `;
    const srcdoc = buildSrcdoc(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
      deck: true,
    });
    const script = extractDeckBridgeScript(srcdoc);
    const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 1920 });
    Object.defineProperty(win, 'innerHeight', { configurable: true, value: 1080 });
    const track = win.document.getElementById('slidesContainer') as HTMLElement;
    track.style.transform = 'translateY(0vh)';
    const evaluate = new win.Function(script);
    evaluate.call(win);

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 40));

    expect(track.style.transform).toBe('translateY(-100vh)');
    expect(track.style.transform).not.toContain('translateX');
  });

  it('routes host navigation through the deck runtime even when the transformed track overflows horizontally', async () => {
    const { win, track, parentPostMessage } = setupTransformDeck();

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 360));

    expect(track.style.transform).toBe('translateX(-100vw)');
    expect(win.document.body.scrollLeft).toBe(0);
    expect(win.document.documentElement.scrollLeft).toBe(0);
    const slideStates = parentPostMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message?.type === 'od:slide-state');
    expect(slideStates.at(-1)).toMatchObject({ active: 1, count: 3 });
  });

  it('advances a #stage 1920px strip by slide width, not 100vw, and syncs #now', async () => {
    const bodyHtml = `
      <style>
        html, body { margin: 0; }
        #stage { display: flex; width: 5760px; transition: none; }
        .slide { flex: 0 0 1920px; width: 1920px; height: 1080px; }
      </style>
      <div class="deck" id="deck">
        <div class="chrome"><span id="now">01</span> / <span id="total">03</span></div>
        <div id="stage">
          <section class="slide" style="width:1920px;height:1080px">One</section>
          <section class="slide" style="width:1920px;height:1080px">Two</section>
          <section class="slide" style="width:1920px;height:1080px">Three</section>
        </div>
      </div>
    `;
    const srcdoc = buildSrcdoc(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
      deck: true,
    });
    expect(srcdoc).toContain('#stage > .slide');
    const script = extractDeckBridgeScript(srcdoc);
    const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(win, 'innerHeight', { configurable: true, value: 600 });
    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('#stage > .slide'));
    slides.forEach((slide) => {
      Object.defineProperty(slide, 'offsetWidth', { configurable: true, value: 1920 });
      Object.defineProperty(slide, 'offsetHeight', { configurable: true, value: 1080 });
    });
    const evaluate = new win.Function(script);
    evaluate.call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 80));
    const stage = win.document.getElementById('stage') as HTMLElement | null;
    const stacked = win.document.getElementById('od-stacked-deck-stage');
    if (stacked) {
      expect(stacked.querySelectorAll('.slide').length).toBeGreaterThanOrEqual(2);
    } else {
      expect(stage?.style.transform).toBe('translateX(-1920px)');
      expect(stage?.style.transform).not.toContain('100vw');
    }
    expect(win.document.getElementById('now')?.textContent).toBe('02');
  });
});
