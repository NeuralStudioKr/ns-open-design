// @vitest-environment node

import { readFile } from 'node:fs/promises';
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
    } else if (slides[0]?.style.display === 'none') {
      expect(slides[1]?.style.display).not.toBe('none');
    } else {
      expect(stage?.style.transform).toBe('translateX(-1920px)');
      expect(stage?.style.transform).not.toContain('100vw');
    }
    expect(win.document.getElementById('now')?.textContent).toBe('02');
  });

  it('uses authored 1920px width when offsetWidth matches a narrower iframe', async () => {
    const bodyHtml = `
      <style>
        html, body { margin: 0; }
        #stage { display: flex; width: 5760px; transition: none; }
        .slide { flex: 0 0 1920px; width: 1920px; height: 1080px; }
      </style>
      <div class="deck" id="deck">
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
      Object.defineProperty(slide, 'offsetWidth', { configurable: true, value: 800 });
      Object.defineProperty(slide, 'offsetHeight', { configurable: true, value: 600 });
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
    } else if (slides[0]?.style.display === 'none') {
      expect(slides[1]?.style.display).not.toBe('none');
    } else {
      expect(stage?.style.transform).toBe('translateX(-1920px)');
    }
  });

  it('syncs #slideCounter and #counter when the host advances', async () => {
    const bodyHtml = `
      <style>
        html, body { margin: 0; height: 100%; }
        .slide { width: 100%; height: 100vh; }
        .slide:not(.active) { display: none; }
      </style>
      <div class="slide-counter" id="slideCounter">01 / 03</div>
      <div class="counter" id="counter">01 / 03</div>
      <div id="progress" style="width:33%"></div>
      <section class="slide active">One</section>
      <section class="slide">Two</section>
      <section class="slide">Three</section>
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
    const evaluate = new win.Function(script);
    evaluate.call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 80));
    expect(win.document.getElementById('slideCounter')?.textContent).toBe('02 / 03');
    expect(win.document.getElementById('counter')?.textContent).toBe('02 / 03');
    expect(String((win.document.getElementById('progress') as HTMLElement | null)?.style.width ?? '')).toMatch(/^66\.6/);
  });

  it('syncs in-deck #now/#total from report even without transformGo', async () => {
    const bodyHtml = `
      <div class="deck" id="deck">
        <div class="chrome"><span id="now">01</span> / <span id="total">10</span></div>
        <div id="stage">
          <section class="slide">One</section>
          <section class="slide">Two</section>
          <section class="slide">Three</section>
        </div>
      </div>
    `;
    const srcdoc = buildSrcdoc(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
      deck: true,
    });
    expect(srcdoc).toMatch(/updateDeckChrome\(i,\s*count\)/);
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
    const stage = win.document.getElementById('stage') as HTMLElement;
    stage.style.transform = 'translateX(-1920px)';
    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('#stage > .slide'));
    slides.forEach((slide) => {
      Object.defineProperty(slide, 'offsetWidth', { configurable: true, value: 1920 });
    });
    Object.defineProperty(stage, 'scrollWidth', { configurable: true, value: 5760 });
    Object.defineProperty(stage, 'offsetWidth', { configurable: true, value: 5760 });
    Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 5760 });
    new win.Function(script).call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide-state-request' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 40));
    expect(win.document.getElementById('now')?.textContent).toBe('02');
    expect(win.document.getElementById('total')?.textContent).toBe('03');
  });

  it('scrubs leftover IB in project preview even without a user brief', async () => {
    const html = await readFile(
      new URL(
        '../../../../plugins/_official/examples/ib-pitch-book/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const srcdoc = buildSrcdoc(html, { deck: true, scrubLeftoverCatalog: true });
    const visible = srcdoc.replace(/<style[\s\S]*?<\/style>/gi, '');
    expect(visible).not.toMatch(/Hartfield/i);
    expect(srcdoc).not.toMatch(/WACC \(base\)/i);
  });

  it('drives leftover IB in-slide #next by 1920px instead of 100vw', async () => {
    const html = await readFile(
      new URL(
        '../../../../plugins/_official/examples/ib-pitch-book/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).toMatch(/Hartfield/i);
    const script = extractDeckBridgeScript(srcdoc);
    const dom = new JSDOM(srcdoc, { runScripts: 'outside-only', pretendToBeVisual: true });
    const win = dom.window;
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(win, 'innerHeight', { configurable: true, value: 600 });
    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('#stage > .slide, .slide'));
    slides.forEach((slide) => {
      Object.defineProperty(slide, 'offsetWidth', { configurable: true, value: 800 });
      Object.defineProperty(slide, 'offsetHeight', { configurable: true, value: 600 });
    });
    const evaluate = new win.Function(script);
    evaluate.call(win);
    expect(script).toContain('bindNativeStripButtons');
    const next = win.document.getElementById('next') as HTMLElement | null;
    expect(next).toBeTruthy();
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 80));
    const stage = win.document.getElementById('stage') as HTMLElement | null;
    const stacked = win.document.getElementById('od-stacked-deck-stage');
    if (!stacked) {
      expect(stage?.style.transform).toBe('translateX(-1920px)');
      expect(stage?.style.transform).not.toContain('100vw');
    }
    expect(win.document.getElementById('now')?.textContent).toBe('02');
    if (next && !stacked) {
      next.click();
      await new Promise<void>((resolve) => win.setTimeout(resolve, 40));
      expect(stage?.style.transform).toBe('translateX(-3840px)');
    }
  });

  it('strips a leaked top-up sentinel from preview without wiping catalog copy', async () => {
    const srcdoc = buildSrcdoc(
      '<!doctype html><html><body>[od:slide_count_top_up]<section class="slide"><h1>영어 회화</h1></section></body></html>',
      { deck: true },
    );
    const visible = srcdoc.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
    expect(visible).not.toMatch(/od:slide_count_top_up/i);
    expect(visible).toContain('영어 회화');
  });

  it('heals a stub cover and moves look CSS out from between slides', () => {
    const brief = '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘';
    const html = [
      '<!doctype html><html><head></head><body>',
      '<section class="slide slide-title" style="display:flex;justify-content:center;padding:80px 88px">',
      '<span data-od-official-motif-html class="ribbon"></span>',
      '<h1>영어 회화 표현 공부 팁, 예시에</h1>',
      '</section>',
      '<style data-od-official-look-css>.cover h1.display{font-size:96px}</style>',
      '<section class="slide"><div class="eyebrow">Why It Matters</div>',
      '<h2>문법으로 외운 회화는 왜 입에서 안 나올까</h2></section>',
      '</body></html>',
    ].join('');
    const srcdoc = buildSrcdoc(html, { deck: true, userBrief: brief });
    const lookAt = srcdoc.indexOf('data-od-official-look-css');
    const secondAt = srcdoc.indexOf('Why It Matters');
    expect(lookAt).toBeGreaterThan(-1);
    expect(lookAt).toBeGreaterThan(secondAt);
    expect(srcdoc).toMatch(/h1 class="display"/);
    expect(srcdoc).toMatch(/cover-meta/);
    expect(srcdoc).not.toMatch(/<span[^>]*data-od-official-motif-html[^>]*>\s*<\/span>/);
  });

  it('leaves a catalog example intact when no user brief is provided', async () => {
    const html = await readFile(
      new URL(
        '../../../../plugins/_official/examples/ib-pitch-book/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).toMatch(/Hartfield/i);
  });

  it('scrubs leftover IB example.html in preview and advances by slide width', async () => {
    const html = await readFile(
      new URL(
        '../../../../plugins/_official/examples/ib-pitch-book/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const brief = '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘';
    const srcdoc = buildSrcdoc(html, { deck: true, userBrief: brief });
    const visible = srcdoc.replace(/<style[\s\S]*?<\/style>/gi, '');
    expect(visible).not.toMatch(/Hartfield/i);
    expect(srcdoc).not.toMatch(/WACC \(base\)/i);
    expect(srcdoc).not.toMatch(/A discounted-cash-flow that/i);
    const script = extractDeckBridgeScript(srcdoc);
    const dom = new JSDOM(srcdoc, { runScripts: 'outside-only', pretendToBeVisual: true });
    const win = dom.window;
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(win, 'innerHeight', { configurable: true, value: 600 });
    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('#stage > .slide, .slide'));
    slides.forEach((slide) => {
      Object.defineProperty(slide, 'offsetWidth', { configurable: true, value: 1920 });
      Object.defineProperty(slide, 'offsetHeight', { configurable: true, value: 1080 });
    });
    const evaluate = new win.Function(script);
    evaluate.call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 120));
    // 0826-N01 F3: leftover Clone HTML (no author script) is hoisted out of
    // `#stage`, so host next uses display toggle — not translateX(-1920px)
    // which only nudged page 1 inside an 800px iframe.
    expect(win.document.getElementById('stage')).toBeNull();
    const after = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
    expect(after.length).toBeGreaterThanOrEqual(2);
    expect(after[0]?.style.display === 'none' || after[0]?.classList.contains('active') === false).toBe(true);
    expect(after[1]?.style.display !== 'none').toBe(true);
  });

  it('pages a pin-only IB #stage strip by 1920px when offsetWidth matches the iframe', async () => {
    const bodyHtml = `
      <style>
        html, body { margin: 0; height: 100%; overflow: hidden; }
        .deck { width: 100vw; height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
        .stage { flex: 1; display: flex; transition: none; }
        .slide { height: 100vh; }
      </style>
      <style data-od-deck-fixed-canvas-pin>
        .slide { width: 1920px !important; min-width: 1920px !important; height: 1080px !important; }
      </style>
      <div class="deck" id="deck">
        <div class="chrome">
          <button id="next" aria-label="Next slide">next</button>
          <span id="now">01</span> / <span id="total">03</span>
        </div>
        <div class="stage" id="stage">
          <section class="slide">One</section>
          <section class="slide">Two</section>
          <section class="slide">Three</section>
        </div>
      </div>
      <script>
        (function () {
          var stage = document.getElementById('stage');
          var now = document.getElementById('now');
          var i = 0;
          document.getElementById('next').onclick = function () {
            i += 1;
            stage.style.transform = 'translateX(-' + (i * 100) + 'vw)';
            now.textContent = String(i + 1).padStart(2, '0');
          };
        })();
      </script>
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
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(win, 'innerHeight', { configurable: true, value: 600 });
    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('#stage > .slide'));
    slides.forEach((slide) => {
      Object.defineProperty(slide, 'offsetWidth', { configurable: true, value: 800 });
      Object.defineProperty(slide, 'offsetHeight', { configurable: true, value: 600 });
    });
    const stage = win.document.getElementById('stage') as HTMLElement;
    Object.defineProperty(stage, 'scrollWidth', { configurable: true, value: 2400 });
    Object.defineProperty(stage, 'offsetWidth', { configurable: true, value: 800 });
    new win.Function(script).call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 80));
    expect(win.document.getElementById('od-stacked-deck-stage')).toBeNull();
    expect(stage.style.transform).toBe('translateX(-1920px)');
    expect(stage.style.transform).not.toContain('100vw');
    expect(win.document.getElementById('now')?.textContent).toBe('02');
  });

  it('heals a sparse IB magazine cover in preview without inventing topic copy', () => {
    const html = `<!doctype html><html lang="ko"><head>
<style data-od-official-look-css>
h1.display { font-size: 72px; }
.cover .ribbon { background: #c00; }
.cover-meta { border-left: 2px solid; }
.mast { display: flex; }
</style>
</head><body>
<section class="slide slide-title" style="width:1920px;height:1080px;display:flex;justify-content:center;padding:80px 88px">
<span class="ribbon"></span>
<h1>영어 회화 표현 공부 팁, 예시에</h1>
</section>
<section class="slide"><h2>문법으로 외운 회화는 왜 입에서 안 나올까</h2><p="">본문</p=""></section>
</body></html>`;
    const srcdoc = buildSrcdoc(html, {
      deck: true,
      userBrief: '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘',
    });
    expect(srcdoc).toMatch(/<h1 class="display">/);
    expect(srcdoc).toMatch(/영어 회화 표현/);
    expect(srcdoc).toMatch(/문법으로 외운 회화/);
    expect(srcdoc).toMatch(/학습 노트/);
    expect(srcdoc).not.toMatch(/English Speaking Tips|쉐도잉|In context/i);
    expect(srcdoc).not.toMatch(/<\/p="">/);
  });
});
