// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildManualEditBridge } from '../../src/edit-mode/bridge';
import {
  MIN_GRAPHIC_WRAPPER_PX,
  buildGraphicContainerBridgeSnippet,
  isDeckSlideRootElement,
  isSizedFlowGraphicWrapper,
  resolveGraphicContainerTarget,
} from '../../src/edit-mode/manual-edit-graphic-container';

describe('manual-edit-graphic-container', () => {
  it('embeds bridge snippet with min wrapper size constant', () => {
    const snippet = buildGraphicContainerBridgeSnippet();
    expect(snippet).toContain(`< ${MIN_GRAPHIC_WRAPPER_PX}`);
    expect(snippet).toContain('isSizedFlowGraphicWrapper');
    expect(buildManualEditBridge(true)).toContain('isSizedFlowGraphicWrapper');
  });

  it('redirects absolute deck cover svg to wrapper', () => {
    const dom = new JSDOM(`
      <section class="slide">
        <div data-od-source-path="path-0-1" style="position:absolute;width:775px;height:508px">
          <svg data-od-source-path="path-0-1-0" width="420" height="420"></svg>
        </div>
      </section>
    `);
    const wrap = dom.window.document.querySelector('div')!;
    const svg = dom.window.document.querySelector('svg')!;
    wrap.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 775, height: 508,
      top: 0, right: 775, bottom: 508, left: 0,
      toJSON: () => ({}),
    } as DOMRect);

    expect(isDeckSlideRootElement(dom.window.document.querySelector('section')!)).toBe(true);
    expect(resolveGraphicContainerTarget(svg)).toBe(wrap);

    dom.window.close();
  });

  it('redirects sized relative flow wrappers to parent', () => {
    const dom = new JSDOM(`
      <main>
        <div data-od-source-path="path-0-0" style="position:relative;width:320px;height:240px;display:flex;align-items:center;justify-content:center">
          <img data-od-source-path="path-0-0-0" src="logo.png" width="120" height="120" alt="Logo" />
        </div>
      </main>
    `);
    const wrap = dom.window.document.querySelector('div')!;
    const img = dom.window.document.querySelector('img')!;
    wrap.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 320, height: 240,
      top: 0, right: 320, bottom: 240, left: 0,
      toJSON: () => ({}),
    } as DOMRect);

    expect(isSizedFlowGraphicWrapper(wrap, dom.window)).toBe(true);
    expect(resolveGraphicContainerTarget(img)).toBe(wrap);

    dom.window.close();
  });

  it('does not redirect tiny inline icons in text flow', () => {
    const dom = new JSDOM(`
      <main>
        <p data-od-source-path="path-0-0">
          Hello
          <svg data-od-source-path="path-0-0-0" width="16" height="16"><circle r="8" /></svg>
          world
        </p>
      </main>
    `);
    const svg = dom.window.document.querySelector('svg')!;
    svg.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 16, height: 16,
      top: 0, right: 16, bottom: 16, left: 0,
      toJSON: () => ({}),
    } as DOMRect);

    expect(resolveGraphicContainerTarget(svg)).toBe(svg);

    dom.window.close();
  });

  it('bridge JS matches TS resolver on deck cover fixture', () => {
    const dom = new JSDOM(
      `<section class="slide">
        <div data-od-source-path="path-0-1" style="position:absolute;left:855px;top:322px;width:775px;height:508px;display:flex;pointer-events:none">
          <svg data-od-source-path="path-0-1-0" width="420" height="420"><circle cx="200" cy="200" r="16" /></svg>
        </div>
      </section>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const wrap = dom.window.document.querySelector('div')!;
    const svg = dom.window.document.querySelector('svg')!;
    wrap.getBoundingClientRect = () => ({
      x: 855, y: 322, width: 775, height: 508,
      top: 322, right: 1630, bottom: 830, left: 855,
      toJSON: () => ({}),
    } as DOMRect);
    svg.getBoundingClientRect = () => ({
      x: 1032, y: 366, width: 420, height: 420,
      top: 366, right: 1452, bottom: 786, left: 1032,
      toJSON: () => ({}),
    } as DOMRect);

    const tsResolved = resolveGraphicContainerTarget(svg);
    expect(tsResolved).toBe(wrap);

    const posts: Array<{ type?: string; target?: { id?: string } }> = [];
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as typeof posts[number]);
    }) as typeof dom.window.parent.postMessage;
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    svg.querySelector('circle')!.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 1100,
      clientY: 420,
    }));

    const select = posts.find((message) => message.type === 'od-edit-select');
    expect(select?.target?.id).toBe('path-0-1');

    dom.window.close();
  });
});
