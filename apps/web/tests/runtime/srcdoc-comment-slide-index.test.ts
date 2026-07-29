// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

function extractSelectionBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-selection-bridge>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('selection bridge script not found');
  return match[1];
}

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('deck bridge script not found');
  return match[1];
}

function markVisible(win: { document: Document }, selector: string): void {
  const el = win.document.querySelector(selector);
  if (!el) throw new Error(`selector not found: ${selector}`);
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 10, y: 20, width: 120, height: 48,
      top: 20, right: 130, bottom: 68, left: 10,
      toJSON: () => ({}),
    }),
  });
}

function setupDeckCommentBridge(bodyHtml: string, visibleSelectors: string[]) {
  const srcdoc = buildSrcdoc(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    deck: true,
    commentBridge: true,
  });
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
  visibleSelectors.forEach((selector) => markVisible(win, selector));

  const deckScript = extractDeckBridgeScript(srcdoc);
  const selectionScript = extractSelectionBridgeScript(srcdoc);
  new win.Function(deckScript).call(win);
  new win.Function(selectionScript).call(win);
  win.dispatchEvent(new win.Event('load'));

  return { win, parentPostMessage };
}

describe('comment bridge — element-scoped slideIndex', () => {
  it('reports the slide that contains the clicked element, not a stale active index', async () => {
    const bodyHtml = `
      <style>
        html, body { margin: 0; overflow: hidden; }
        #deck { display: flex; width: 300vw; transform: translateX(-200vw); }
        .slide { flex: 0 0 100vw; width: 100vw; height: 100vh; }
      </style>
      <div id="deck">
        <section class="slide"><h1 data-od-id="s0">Slide 0</h1></section>
        <section class="slide"><h1 data-od-id="s1">Slide 1</h1></section>
        <section class="slide"><h1 data-od-id="s2">Slide 2</h1></section>
      </div>
    `;
    const { win, parentPostMessage } = setupDeckCommentBridge(bodyHtml, ['[data-od-id="s2"]']);
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 1000 });

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    parentPostMessage.mockClear();

    win.document.querySelector('[data-od-id="s2"]')!.dispatchEvent(
      new win.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 20 }),
    );

    const clickMessages = parentPostMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message?.type === 'od:comment-target');
    expect(clickMessages).toHaveLength(1);
    expect(clickMessages[0]?.slideIndex).toBe(2);
    expect(clickMessages[0]?.elementId).toBe('s2');
  });

  it('uses element slide when active class disagrees with visible slide', async () => {
    const bodyHtml = `
      <section class="slide active" data-slide-index="0"><p data-od-id="p0">First</p></section>
      <section class="slide" data-slide-index="1"><p data-od-id="p1">Second</p></section>
      <section class="slide" data-slide-index="2"><p data-od-id="p2">Third</p></section>
    `;
    const { win, parentPostMessage } = setupDeckCommentBridge(bodyHtml, ['[data-od-id="p2"]']);

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    parentPostMessage.mockClear();

    win.document.querySelector('[data-od-id="p2"]')!.dispatchEvent(
      new win.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    const clickMessages = parentPostMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message?.type === 'od:comment-target');
    expect(clickMessages).toHaveLength(1);
    expect(clickMessages[0]?.slideIndex).toBe(2);
  });
});
