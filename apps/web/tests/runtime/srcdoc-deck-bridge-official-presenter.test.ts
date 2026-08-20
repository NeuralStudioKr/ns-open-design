// @vitest-environment node

import { readFileSync } from 'node:fs';
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
});
