// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

const repoRoot = resolve(import.meta.dirname, '../../../..');

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('deck bridge script not found in srcdoc');
  return match[1];
}

function lastSlideState(parentPostMessage: ReturnType<typeof vi.fn>) {
  const messages = parentPostMessage.mock.calls
    .map((call) => call[0])
    .filter((message) => message?.type === 'od:slide-state');
  return messages.at(-1) as { type: string; active: number; count: number } | undefined;
}

function postSlide(win: Window, action: 'next' | 'prev') {
  win.dispatchEvent(new win.MessageEvent('message', {
    data: { type: 'od:slide', action },
  }));
}

function extractNonOdScripts(srcdoc: string): string[] {
  const scripts: string[] = [];
  for (const match of srcdoc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] ?? '';
    if (/data-od-/i.test(attrs)) continue;
    const body = match[2]?.trim();
    if (body) scripts.push(body);
  }
  return scripts;
}

function paintedSlideCopy(el: Element | null): string {
  if (!el) return '';
  const host = el as HTMLElement;
  if (host.style.display === 'none' || host.style.visibility === 'hidden') return '';
  return (host.textContent || '').replace(/\s+/g, ' ').trim();
}

describe('deck bridge — official catalog presenter navigation', () => {
  it('does not treat 1-based nav-dot data-slide as already being on slide 2', async () => {
    const official = readFileSync(
      resolve(repoRoot, 'plugins/_official/examples/html-ppt-zhangzara-capsule/example.html'),
      'utf8',
    );
    const srcdoc = buildSrcdoc(official, { deck: true });
    const script = extractDeckBridgeScript(srcdoc);
    const dom = new JSDOM(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''), {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    const parentPostMessage = vi.fn();
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: parentPostMessage },
    });
    new win.Function(script).call(win);
    win.dispatchEvent(new win.Event('load'));
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide-state-request' } }));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 0, count: 10 });
    expect(win.document.querySelector('.slide-1')?.classList.contains('active')).toBe(true);
    expect(win.document.getElementById('current')?.textContent).toBe('01');

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 40));

    expect(win.document.querySelector('.slide-1')?.classList.contains('active')).toBe(false);
    expect(win.document.querySelector('.slide-2')?.classList.contains('active')).toBe(true);
    expect(win.document.querySelector('.slide-3')?.classList.contains('active')).toBe(false);
    expect(win.document.querySelector('.nav-dot[data-slide="2"]')?.classList.contains('active')).toBe(true);
    expect(win.document.getElementById('current')?.textContent).toBe('02');
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 10 });

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 40));

    expect(win.document.querySelector('.slide-3')?.classList.contains('active')).toBe(true);
    expect(win.document.querySelector('.nav-dot[data-slide="3"]')?.classList.contains('active')).toBe(true);
    expect(win.document.getElementById('current')?.textContent).toBe('03');
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 2, count: 10 });
  });

  it('navigates <deck-stage> via goTo instead of display:none (preview page 2 stays painted)', async () => {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head>
<body>
<deck-stage>
  <section class="slide s-cover">Cover After Hours</section>
  <section class="slide s-toc">The Index</section>
  <section class="slide s-stats">By the Numbers</section>
</deck-stage>
</body></html>`;
    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).not.toContain('data-od-deck-stacked-fix');
    const script = extractDeckBridgeScript(srcdoc);
    const dom = new JSDOM(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''), {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    class DeckStage extends win.HTMLElement {
      _index = 0;
      connectedCallback() {
        this._apply(0);
      }
      get index() { return this._index; }
      get length() { return this.querySelectorAll('.slide').length; }
      goTo(i: number) {
        this._index = Math.max(0, Math.min(this.length - 1, i));
        this._apply(this._index);
      }
      next() { this.goTo(this._index + 1); }
      prev() { this.goTo(this._index - 1); }
      _apply(curr: number) {
        this.querySelectorAll('.slide').forEach((slide, index) => {
          if (index === curr) slide.setAttribute('data-deck-active', '');
          else slide.removeAttribute('data-deck-active');
        });
      }
    }
    win.customElements.define('deck-stage', DeckStage);
    const parentPostMessage = vi.fn();
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: parentPostMessage },
    });
    new win.Function(script).call(win);
    win.document.querySelectorAll('deck-stage').forEach((node) => {
      if (typeof (node as { connectedCallback?: () => void }).connectedCallback === 'function') {
        (node as { connectedCallback: () => void }).connectedCallback();
      }
    });
    win.dispatchEvent(new win.Event('load'));
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide-state-request' } }));

    const slides = [...win.document.querySelectorAll('.slide')] as HTMLElement[];
    expect(slides).toHaveLength(3);
    expect(slides[0]?.hasAttribute('data-deck-active')).toBe(true);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 0, count: 3 });

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 40));

    expect(win.document.getElementById('od-stacked-deck-stage')).toBeNull();
    expect(slides[0]?.hasAttribute('data-deck-active')).toBe(false);
    expect(slides[1]?.hasAttribute('data-deck-active')).toBe(true);
    expect(slides[1]?.textContent).toContain('The Index');
    expect(slides[0]?.style.display).not.toBe('none');
    expect(slides[1]?.style.display).not.toBe('none');
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });

  it('does not let a content CTA arrow swallow host next (product-launch dialect)', async () => {
    const html = `<!doctype html><html><head><style>
.slide{position:absolute;inset:0;opacity:0}
.slide.is-active{opacity:1}
</style></head><body>
<div class="deck">
  <section class="slide is-active"><h1>Cover</h1></section>
  <section class="slide"><h1>Agenda</h1></section>
  <section class="slide dark"><a class="cta-btn" href="#">Pre-order Halo v2 →</a></section>
</div>
</body></html>`;
    const srcdoc = buildSrcdoc(html, { deck: true });
    const script = extractDeckBridgeScript(srcdoc);
    const dom = new JSDOM(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''), {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    const parentPostMessage = vi.fn();
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: parentPostMessage },
    });
    new win.Function(script).call(win);
    win.dispatchEvent(new win.Event('load'));
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide-state-request' } }));
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 0, count: 3 });

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 40));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
    expect(win.document.querySelectorAll('.slide')[1]?.classList.contains('is-active')).toBe(true);
    expect(win.document.querySelectorAll('.slide')[0]?.classList.contains('is-active')).toBe(false);
  });

  it('advances page 2 on every official html-ppt catalog presenter', async () => {
    const examplesDir = resolve(repoRoot, 'plugins/_official/examples');
    const dirs = readdirSync(examplesDir).filter((name) => name.startsWith('html-ppt-'));
    expect(dirs.length).toBeGreaterThan(20);
    const failures: string[] = [];

    for (const dir of dirs) {
      const html = readFileSync(resolve(examplesDir, dir, 'example.html'), 'utf8');
      const srcdoc = buildSrcdoc(html, { deck: true });
      const script = extractDeckBridgeScript(srcdoc);
      const dom = new JSDOM(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''), {
        runScripts: 'outside-only',
        pretendToBeVisual: true,
      });
      const win = dom.window;
      const parentPostMessage = vi.fn();
      Object.defineProperty(win, 'parent', {
        configurable: true,
        value: { postMessage: parentPostMessage },
      });
      if (win.document.querySelector('deck-stage')) {
        class DeckStage extends win.HTMLElement {
          _index = 0;
          connectedCallback() { this._apply(0); }
          get length() {
            return [...this.children].filter((node) => node.nodeType === 1).length;
          }
          goTo(i: number) {
            this._index = Math.max(0, Math.min(this.length - 1, i));
            this._apply(this._index);
          }
          _apply(curr: number) {
            [...this.children].forEach((slide, index) => {
              if (slide.nodeType !== 1) return;
              const el = slide as HTMLElement;
              if (index === curr) el.setAttribute('data-deck-active', '');
              else el.removeAttribute('data-deck-active');
            });
          }
        }
        try { win.customElements.define('deck-stage', DeckStage); } catch { /* defined */ }
      }
      new win.Function(script).call(win);
      win.document.querySelectorAll('deck-stage').forEach((node) => {
        const cb = (node as { connectedCallback?: () => void }).connectedCallback;
        if (typeof cb === 'function') cb.call(node);
      });
      win.dispatchEvent(new win.Event('load'));
      win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide-state-request' } }));
      const before = lastSlideState(parentPostMessage);
      postSlide(win, 'next');
      await new Promise<void>((resolve) => win.setTimeout(resolve, 20));
      const after = lastSlideState(parentPostMessage);
      if (!before || (before.count ?? 0) < 2) {
        failures.push(`${dir}: count=${before?.count ?? '?'}`);
        continue;
      }
      if (!after || after.active !== 1 || after.count !== before.count) {
        failures.push(`${dir}: ${before.active}/${before.count} -> ${after?.active}/${after?.count}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('keeps Playful page 5 painted after restoreInitialSlide + native next (opacity-stack)', async () => {
    const html = readFileSync(
      resolve(repoRoot, 'plugins/_official/examples/html-ppt-zhangzara-playful/example.html'),
      'utf8',
    );
    const srcdoc = buildSrcdoc(html, { deck: true });
    const script = extractDeckBridgeScript(srcdoc);
    const authorScripts = extractNonOdScripts(srcdoc);
    const dom = new JSDOM(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''), {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    const parentPostMessage = vi.fn();
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: parentPostMessage },
    });
    for (const author of authorScripts) new win.Function(author).call(win);
    new win.Function(script).call(win);
    win.dispatchEvent(new win.Event('load'));
    // restoreInitialSlide (100ms observe + 200ms load) used to display:none
    // every inactive opacity-stack page. Native #nextBtn then only flips
    // .active, leaving page 5 as peach body with no "The Collective".
    await new Promise<void>((resolve) => win.setTimeout(resolve, 260));

    for (let i = 0; i < 4; i++) {
      postSlide(win, 'next');
      await new Promise<void>((resolve) => win.setTimeout(resolve, 30));
    }

    const slide5 = win.document.querySelector('.slide-5') as HTMLElement | null;
    expect(slide5?.classList.contains('active')).toBe(true);
    expect(slide5?.style.display).not.toBe('none');
    expect(slide5?.style.visibility).not.toBe('hidden');
    expect(paintedSlideCopy(slide5)).toContain('The Collective');
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 4, count: 10 });
  });

  it('does not trap official html-ppt pages behind display:none after restore + next', async () => {
    const examplesDir = resolve(repoRoot, 'plugins/_official/examples');
    const dirs = readdirSync(examplesDir).filter((name) => name.startsWith('html-ppt-'));
    const failures: string[] = [];

    for (const dir of dirs) {
      const html = readFileSync(resolve(examplesDir, dir, 'example.html'), 'utf8');
      const srcdoc = buildSrcdoc(html, { deck: true });
      const script = extractDeckBridgeScript(srcdoc);
      const authorScripts = extractNonOdScripts(srcdoc);
      const dom = new JSDOM(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''), {
        runScripts: 'outside-only',
        pretendToBeVisual: true,
      });
      const win = dom.window;
      const parentPostMessage = vi.fn();
      Object.defineProperty(win, 'parent', {
        configurable: true,
        value: { postMessage: parentPostMessage },
      });
      if (win.document.querySelector('deck-stage')) {
        class DeckStage extends win.HTMLElement {
          _index = 0;
          connectedCallback() { this._apply(0); }
          get length() {
            return [...this.children].filter((node) => node.nodeType === 1).length;
          }
          goTo(i: number) {
            this._index = Math.max(0, Math.min(this.length - 1, i));
            this._apply(this._index);
          }
          _apply(curr: number) {
            [...this.children].forEach((slide, index) => {
              if (slide.nodeType !== 1) return;
              const el = slide as HTMLElement;
              if (index === curr) el.setAttribute('data-deck-active', '');
              else el.removeAttribute('data-deck-active');
            });
          }
        }
        try { win.customElements.define('deck-stage', DeckStage); } catch { /* defined */ }
      }
      for (const author of authorScripts) {
        try { new win.Function(author).call(win); } catch { /* template chrome */ }
      }
      new win.Function(script).call(win);
      win.document.querySelectorAll('deck-stage').forEach((node) => {
        const cb = (node as { connectedCallback?: () => void }).connectedCallback;
        if (typeof cb === 'function') cb.call(node);
      });
      win.dispatchEvent(new win.Event('load'));
      // Same path as restoreInitialSlide — goto 0 then native/host next —
      // without waiting the 200ms load timer for every catalog example.
      win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'od:slide', action: 'go', index: 0 },
      }));
      await new Promise<void>((resolve) => win.setTimeout(resolve, 20));
      postSlide(win, 'next');
      await new Promise<void>((resolve) => win.setTimeout(resolve, 20));

      const after = lastSlideState(parentPostMessage);
      if (!after || after.count < 2) {
        failures.push(`${dir}: count=${after?.count ?? '?'}`);
        continue;
      }
      const slides = [...win.document.querySelectorAll(
        '.slide, .ppt-slide, .deck-slide, [data-screen-label]',
      )] as HTMLElement[];
      const marked = slides.filter((el) =>
        el.classList.contains('active')
        || el.classList.contains('is-active')
        || el.classList.contains('current')
        || el.hasAttribute('data-deck-active'),
      );
      const trapped = marked.filter((el) =>
        el.style.display === 'none' || el.style.visibility === 'hidden',
      );
      if (trapped.length) {
        failures.push(`${dir}: ${trapped.length} marked-active slide(s) still host-hidden`);
        continue;
      }
      const active = slides[after.active];
      if (active && (active.style.display === 'none' || active.style.visibility === 'hidden')) {
        failures.push(`${dir}: reported active ${after.active} host-hidden`);
      }
    }

    expect(failures).toEqual([]);
  }, 20_000);
});
