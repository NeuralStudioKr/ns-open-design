import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  MANUAL_EDIT_DISCOVERY_SELECTOR,
  buildManualEditBridge,
  buildManualEditBridgeStyle,
  isDeckSlideRootElement,
  isMeaningfulManualEditElement,
  isManualEditHostNode,
  isSourceMappableManualEditElement,
  manualEditDomPathForElement,
  manualEditStableIdForElement,
  resolveGraphicContainerTarget,
} from '../../src/edit-mode/bridge';

describe('manual edit bridge target normalization', () => {
  it('prefers explicit data-od-id over generated ids', () => {
    const dom = new JSDOM('<main><h1 data-od-id="hero">Title</h1></main>');
    const target = dom.window.document.querySelector('h1')!;

    expect(manualEditStableIdForElement(target)).toBe('hero');
    expect(target.getAttribute('data-od-runtime-id')).toBeNull();
  });

  it('generates stable DOM path ids for unannotated elements', () => {
    const dom = new JSDOM('<main><section><p>First</p><p>Second</p></section></main>');
    const target = dom.window.document.querySelectorAll('p')[1]!;

    expect(manualEditDomPathForElement(target)).toBe('path-0-0-1');
    expect(manualEditStableIdForElement(target)).toBe('path-0-0-1');
    expect(manualEditStableIdForElement(target)).toBe('path-0-0-1');
    expect(target.getAttribute('data-od-runtime-id')).toBe('path-0-0-1');
  });

  it('generates DOM path ids against source-shaped children, ignoring host shim nodes', () => {
    const dom = new JSDOM(
      '<script data-od-sandbox-shim></script><main><section><p>First</p><p>Second</p></section></main><script data-od-edit-bridge></script>',
    );
    const target = dom.window.document.querySelectorAll('p')[1]!;

    expect(isManualEditHostNode(dom.window.document.querySelector('[data-od-sandbox-shim]')!)).toBe(true);
    expect(manualEditDomPathForElement(target)).toBe('path-0-0-1');
  });

  it('syncs textDecoration and whiteSpace into bridge styleProps', () => {
    const bridge = buildManualEditBridge(true);
    expect(bridge).toContain("'textDecoration'");
    expect(bridge).toContain("'whiteSpace'");
  });

  it('discovers meaningful elements and ignores tiny or irrelevant elements', () => {
    const dom = new JSDOM('<main><h1 data-od-source-path="path-0-0">Title</h1><script>1</script></main>');
    const title = dom.window.document.querySelector('h1')!;
    const script = dom.window.document.querySelector('script')!;

    expect(isMeaningfulManualEditElement(title, { width: 80, height: 24 })).toBe(true);
    expect(isMeaningfulManualEditElement(title, { width: 3, height: 24 })).toBe(false);
    expect(isMeaningfulManualEditElement(script, { width: 80, height: 24 })).toBe(false);
  });

  it('resolveGraphicContainerTarget redirects deck cover svg to absolute wrapper', () => {
    const dom = new JSDOM(`
      <section class="slide" data-screen-label="01 Cover">
        <div data-od-source-path="path-0-1" style="position:absolute;left:855px;top:322px;width:775px;height:508px;display:flex;align-items:center;justify-content:center;pointer-events:none">
          <svg data-od-source-path="path-0-1-0" viewBox="0 0 400 400" width="420" height="420">
            <circle cx="200" cy="200" r="16" fill="#818cf8"></circle>
            <text x="200" y="207">NS</text>
          </svg>
        </div>
      </section>
    `);
    const wrap = dom.window.document.querySelector('div')!;
    const svg = dom.window.document.querySelector('svg')!;
    const circle = dom.window.document.querySelector('circle')!;

    expect(isDeckSlideRootElement(dom.window.document.querySelector('section')!)).toBe(true);
    expect(resolveGraphicContainerTarget(svg)).toBe(wrap);
    expect(resolveGraphicContainerTarget(circle)).toBe(circle);
    expect(resolveGraphicContainerTarget(wrap)).toBe(wrap);

    dom.window.close();
  });

  it('selects absolute graphic wrapper (not inner svg) for deck cover icons', () => {
    const dom = new JSDOM(
      `<section class="slide" data-screen-label="01 Cover">
        <div data-od-source-path="path-0-1" style="position:absolute;left:855px;top:322px;width:775px;height:508px;display:flex;align-items:center;justify-content:center;pointer-events:none">
          <svg data-od-source-path="path-0-1-0" viewBox="0 0 400 400" width="420" height="420">
            <circle cx="200" cy="200" r="16" fill="#818cf8"></circle>
            <text x="200" y="207">NS</text>
          </svg>
        </div>
      </section>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const posts: Array<{ type?: string; target?: { id?: string; kind?: string; tagName?: string; rect?: { width: number; height: number }; styles?: Record<string, string> } }> = [];
    const wrap = dom.window.document.querySelector('div')!;
    const svg = dom.window.document.querySelector('svg')!;
    const circle = dom.window.document.querySelector('circle')!;
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
    circle.getBoundingClientRect = svg.getBoundingClientRect;
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as typeof posts[number]);
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));

    circle.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 1100,
      clientY: 420,
    }));

    const select = posts.find((message) => message.type === 'od-edit-select');
    expect(select?.target?.tagName).toBe('div');
    expect(select?.target?.kind).toBe('container');
    expect(select?.target?.id).toBe('path-0-1');
    expect(select?.target?.styles?.position).toBe('absolute');
    expect(select?.target?.styles?.left).toBe('855px');
    expect(select?.target?.styles?.top).toBe('322px');
    expect(select?.target?.rect).toMatchObject({ width: 775, height: 508 });

    dom.window.close();
  });

  it('lists absolute graphic wrapper in od-edit-targets but not inner svg', async () => {
    const posts: Array<{ type?: string; targets?: Array<{ id: string; tagName?: string }> }> = [];
    const dom = new JSDOM(
      `<section class="slide" data-screen-label="01 Cover">
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
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as typeof posts[number]);
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const targetsMessage = posts.find((message) => message.type === 'od-edit-targets');
    const ids = targetsMessage?.targets?.map((item) => item.id) ?? [];
    expect(ids).toContain('path-0-1');
    expect(ids).not.toContain('path-0-1-0');
    expect(wrap.getAttribute('data-od-edit-graphic-wrapper')).toBe('true');

    dom.window.close();
  });

  it('includes svg in discovery so logos are not selected as parent containers', () => {
    expect(MANUAL_EDIT_DISCOVERY_SELECTOR.split(',').map((s) => s.trim())).toContain('svg');
    const bridge = buildManualEditBridge(true);
    expect(bridge).toContain(', svg,');
    expect(bridge).toContain("tag === 'img' || tag === 'svg'");

    const dom = new JSDOM(
      `<main>
        <div data-od-source-path="path-0-0" style="width:400px;height:200px">
          <svg data-od-source-path="path-0-0-0" width="32" height="32" viewBox="0 0 32 32"><path d="M0 0h32v32z"/></svg>
        </div>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const posts: Array<{ type?: string; target?: { id?: string; kind?: string; tagName?: string; rect?: { width: number; height: number } } }> = [];
    const wrap = dom.window.document.querySelector('div')!;
    const svg = dom.window.document.querySelector('svg')!;
    const path = dom.window.document.querySelector('path')!;
    wrap.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 400, height: 200,
      top: 0, right: 400, bottom: 200, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    svg.getBoundingClientRect = () => ({
      x: 10, y: 10, width: 32, height: 32,
      top: 10, right: 42, bottom: 42, left: 10,
      toJSON: () => ({}),
    } as DOMRect);
    path.getBoundingClientRect = svg.getBoundingClientRect;
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as typeof posts[number]);
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));

    path.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

    const select = posts.find((message) => message.type === 'od-edit-select');
    expect(select?.target?.tagName).toBe('svg');
    expect(select?.target?.kind).toBe('image');
    expect(select?.target?.id).toBe('path-0-0-0');
    expect(select?.target?.rect).toMatchObject({ width: 32, height: 32 });

    dom.window.close();
  });

  it('selects img elements annotated with data-screen-label only', () => {
    const dom = new JSDOM(
      `<main>
        <div data-od-id="hero-card" style="width:400px;height:200px;padding:24px">
          <img data-screen-label="mindmap-logo" src="logo.svg" alt="Logo" width="120" height="120" />
        </div>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const posts: Array<{ type?: string; target?: { id?: string; kind?: string; tagName?: string } }> = [];
    const wrap = dom.window.document.querySelector('div')!;
    const img = dom.window.document.querySelector('img')!;
    wrap.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 400, height: 200,
      top: 0, right: 400, bottom: 200, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    img.getBoundingClientRect = () => ({
      x: 24, y: 24, width: 120, height: 120,
      top: 24, right: 144, bottom: 144, left: 24,
      toJSON: () => ({}),
    } as DOMRect);
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as typeof posts[number]);
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));

    img.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 80, clientY: 80 }));

    const select = posts.find((message) => message.type === 'od-edit-select');
    expect(select?.target?.tagName).toBe('img');
    expect(select?.target?.kind).toBe('image');
    expect(select?.target?.id).toBe('mindmap-logo');

    dom.window.close();
  });

  it('selects svg with pointer-events:none when edit mode re-enables hit testing', () => {
    const dom = new JSDOM(
      `<main>
        <div data-od-id="diagram-wrap" style="width:400px;height:200px">
          <svg data-screen-label="mindmap-svg" width="160" height="160" style="pointer-events:none">
            <circle cx="80" cy="80" r="40" fill="#2563eb" />
          </svg>
        </div>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const posts: Array<{ type?: string; target?: { id?: string; kind?: string; tagName?: string } }> = [];
    const svg = dom.window.document.querySelector('svg')!;
    const circle = dom.window.document.querySelector('circle')!;
    svg.getBoundingClientRect = () => ({
      x: 20, y: 20, width: 160, height: 160,
      top: 20, right: 180, bottom: 180, left: 20,
      toJSON: () => ({}),
    } as DOMRect);
    circle.getBoundingClientRect = svg.getBoundingClientRect;
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as typeof posts[number]);
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));

    circle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 80, clientY: 80 }));

    const select = posts.find((message) => message.type === 'od-edit-select');
    expect(select?.target?.tagName).toBe('svg');
    expect(select?.target?.kind).toBe('image');
    expect(select?.target?.id).toBe('mindmap-svg');

    dom.window.close();
  });

  it('treats data-screen-label as source-mappable for manual edit discovery', () => {
    const dom = new JSDOM('<main><img data-screen-label="logo" src="x.svg" alt="x" /></main>');
    const img = dom.window.document.querySelector('img')!;
    expect(isSourceMappableManualEditElement(img)).toBe(true);
    expect(manualEditStableIdForElement(img)).toBe('logo');
  });

  it('keeps source-mappable display:none targets available for the layers panel', async () => {
    const posts: Array<{ type?: string; targets?: Array<{ id: string; isHidden?: boolean }> }> = [];
    const dom = new JSDOM(
      `<main>
        <h1 data-od-source-path="path-0-0">Visible title</h1>
        <section data-od-source-path="path-0-1" style="display:none">
          <p data-od-source-path="path-0-1-0">Hidden author notes</p>
        </section>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const visible = dom.window.document.querySelector('h1')!;
    const hiddenSection = dom.window.document.querySelector('section')!;
    const hiddenParagraph = dom.window.document.querySelector('p')!;
    visible.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 160, height: 32,
      top: 0, right: 160, bottom: 32, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    hiddenSection.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 0, height: 0,
      top: 0, right: 0, bottom: 0, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    hiddenParagraph.getBoundingClientRect = hiddenSection.getBoundingClientRect;
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string; targets?: Array<{ id: string; isHidden?: boolean }> });
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const targetsMessage = posts.find((message) => message.type === 'od-edit-targets');
    expect(targetsMessage?.targets?.map((target) => target.id)).toEqual([
      'path-0-0',
      'path-0-1',
      'path-0-1-0',
    ]);
    expect(targetsMessage?.targets?.find((target) => target.id === 'path-0-1')?.isHidden).toBe(true);
    expect(targetsMessage?.targets?.find((target) => target.id === 'path-0-1-0')?.isHidden).toBe(true);

    dom.window.close();
  });

  it('treats hidden containers as layout editable targets', async () => {
    const posts: Array<{ type?: string; targets?: Array<{ id: string; isHidden?: boolean; isLayoutContainer?: boolean }> }> = [];
    const dom = new JSDOM(
      `<main>
        <section data-od-source-path="path-0-0" style="display:none">
          <p data-od-source-path="path-0-0-0">Hidden layout copy</p>
        </section>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const section = dom.window.document.querySelector('section')!;
    const paragraph = dom.window.document.querySelector('p')!;
    section.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 0, height: 0,
      top: 0, right: 0, bottom: 0, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    paragraph.getBoundingClientRect = section.getBoundingClientRect;
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string; targets?: Array<{ id: string; isHidden?: boolean; isLayoutContainer?: boolean }> });
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const targetsMessage = posts.find((message) => message.type === 'od-edit-targets');
    const hiddenSection = targetsMessage?.targets?.find((target) => target.id === 'path-0-0');
    const hiddenParagraph = targetsMessage?.targets?.find((target) => target.id === 'path-0-0-0');
    expect(hiddenSection?.isHidden).toBe(true);
    expect(hiddenSection?.isLayoutContainer).toBe(true);
    expect(hiddenParagraph?.isLayoutContainer).toBe(false);

    dom.window.close();
  });

  it('does not treat visibility-hidden block containers as layout editable targets', async () => {
    const posts: Array<{ type?: string; targets?: Array<{ id: string; isHidden?: boolean; isLayoutContainer?: boolean }> }> = [];
    const dom = new JSDOM(
      `<main>
        <section data-od-source-path="path-0-0" style="visibility:hidden">
          <p data-od-source-path="path-0-0-0">Hidden block copy</p>
        </section>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const section = dom.window.document.querySelector('section')!;
    const paragraph = dom.window.document.querySelector('p')!;
    section.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 160, height: 32,
      top: 0, right: 160, bottom: 32, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    paragraph.getBoundingClientRect = () => ({
      x: 8, y: 8, width: 140, height: 20,
      top: 8, right: 148, bottom: 28, left: 8,
      toJSON: () => ({}),
    } as DOMRect);
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string; targets?: Array<{ id: string; isHidden?: boolean; isLayoutContainer?: boolean }> });
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const targetsMessage = posts.find((message) => message.type === 'od-edit-targets');
    const hiddenSection = targetsMessage?.targets?.find((target) => target.id === 'path-0-0');
    expect(hiddenSection?.isHidden).toBe(true);
    expect(hiddenSection?.isLayoutContainer).toBe(false);

    dom.window.close();
  });

  it('does not treat block containers hidden only by an ancestor as layout editable targets', async () => {
    const posts: Array<{ type?: string; targets?: Array<{ id: string; isHidden?: boolean; isLayoutContainer?: boolean }> }> = [];
    const dom = new JSDOM(
      `<main>
        <div data-od-source-path="path-0-0" style="display:none">
          <section data-od-source-path="path-0-0-0">Nested hidden section</section>
        </div>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const wrapper = dom.window.document.querySelector('div')!;
    const section = dom.window.document.querySelector('section')!;
    wrapper.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 0, height: 0,
      top: 0, right: 0, bottom: 0, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    section.getBoundingClientRect = wrapper.getBoundingClientRect;
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string; targets?: Array<{ id: string; isHidden?: boolean; isLayoutContainer?: boolean }> });
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const targetsMessage = posts.find((message) => message.type === 'od-edit-targets');
    const hiddenSection = targetsMessage?.targets?.find((target) => target.id === 'path-0-0-0');
    expect(hiddenSection?.isHidden).toBe(true);
    expect(hiddenSection?.isLayoutContainer).toBe(false);

    dom.window.close();
  });

  it('does not mark visibility:visible descendants as hidden', async () => {
    const posts: Array<{ type?: string; targets?: Array<{ id: string; isHidden?: boolean }> }> = [];
    const dom = new JSDOM(
      `<main>
        <section data-od-source-path="path-0-0" style="visibility:hidden">
          <p data-od-source-path="path-0-0-0" style="visibility:visible">Visible child copy</p>
        </section>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const section = dom.window.document.querySelector('section')!;
    const visibleChild = dom.window.document.querySelector('p')!;
    section.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 160, height: 32,
      top: 0, right: 160, bottom: 32, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    visibleChild.getBoundingClientRect = () => ({
      x: 8, y: 8, width: 140, height: 20,
      top: 8, right: 148, bottom: 28, left: 8,
      toJSON: () => ({}),
    } as DOMRect);
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string; targets?: Array<{ id: string; isHidden?: boolean }> });
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const targetsMessage = posts.find((message) => message.type === 'od-edit-targets');
    expect(targetsMessage?.targets?.find((target) => target.id === 'path-0-0')?.isHidden).toBe(true);
    expect(targetsMessage?.targets?.find((target) => target.id === 'path-0-0-0')?.isHidden).toBe(false);

    dom.window.close();
  });

  it('does not expose path targets unless they carry a source path marker', () => {
    const dom = new JSDOM('<main><h1>Runtime title</h1><p data-od-source-path="path-0-1">Source text</p></main>');
    const runtimeTitle = dom.window.document.querySelector('h1')!;
    const sourceText = dom.window.document.querySelector('p')!;

    expect(isSourceMappableManualEditElement(runtimeTitle)).toBe(false);
    expect(isSourceMappableManualEditElement(sourceText)).toBe(true);
    expect(isMeaningfulManualEditElement(runtimeTitle, { width: 80, height: 24 })).toBe(false);
  });

  it('omits selected outerHTML from bulk target posts but includes it for selected targets', () => {
    const bridge = buildManualEditBridge(true);

    expect(bridge).toContain('targets.push(targetFrom(resolved, false))');
    expect(bridge).toContain("target: targetFrom(el, true)");
    expect(bridge).toContain('if (!isSourceMappable(node)) continue;');
    expect(bridge).toContain('resolveGraphicContainerTarget(node)');
    expect(bridge).not.toContain('if (isPrimaryTarget(el)) return el;');
  });

  it('prefers the deepest source-mapped child over an annotated group on hover', async () => {
    const posts: Array<{ type?: string; target?: { id: string; label?: string } }> = [];
    const dom = new JSDOM(
      `<main>
        <section data-od-id="hero-group">
          <span data-od-source-path="path-0-0-0">Small label</span>
        </section>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const span = dom.window.document.querySelector('span')!;
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string; target?: { id: string; label?: string } });
    }) as typeof dom.window.parent.postMessage;

    span.dispatchEvent(new dom.window.Event('pointerover', { bubbles: true }));

    const hover = posts.find((message) => message.type === 'od-edit-hover');
    expect(hover?.target?.id).toBe('path-0-0-0');
    expect(hover?.target?.label).toBe('Small label');

    dom.window.close();
  });

  it('acks live preview style patches by id and version', () => {
    const bridge = buildManualEditBridge(true);

    expect(bridge).toContain("type: 'od-edit-preview-style-applied'");
    expect(bridge).toContain('version: Number(version) || 0, ok: true');
    expect(bridge).toContain("ok: false, error: 'Target not found'");
  });

  it('applies preview styles with !important so artifact CSS cannot suppress the live tweak', () => {
    const dom = new JSDOM(
      `<style>[data-od-id="hero"] { font-size: 12px !important; color: red !important; }</style>
      <main><h1 data-od-id="hero">Hero</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const hero = dom.window.document.querySelector('[data-od-id="hero"]') as HTMLElement;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: {
        type: 'od-edit-preview-style',
        id: 'hero',
        styles: { fontSize: '42px', color: 'rgb(0, 0, 255)' },
        version: 1,
      },
    }));

    expect(hero.style.getPropertyPriority('font-size')).toBe('important');
    expect(hero.style.getPropertyPriority('color')).toBe('important');
    expect(hero.style.getPropertyValue('font-size')).toBe('42px');

    dom.window.close();
  });

  it('ignores non-allowlisted keys in od-edit-preview-style', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="hero">Hero</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const hero = dom.window.document.querySelector('[data-od-id="hero"]') as HTMLElement;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: {
        type: 'od-edit-preview-style',
        id: 'hero',
        styles: {
          fontSize: '30px',
          backgroundImage: 'url(https://evil.example/x.png)',
          behavior: 'url(#xss)',
        },
        version: 3,
      },
    }));

    expect(hero.style.getPropertyValue('font-size')).toBe('30px');
    expect(hero.style.getPropertyValue('background-image')).toBe('');
    expect(hero.style.getPropertyValue('behavior')).toBe('');

    dom.window.close();
  });

  it('coerces unitless preview lengths to px like persist', () => {
    const bridge = buildManualEditBridge(true);
    expect(bridge).toContain('coercePreviewStyleValue');
    expect(bridge).toContain("trimmed + 'px'");

    const dom = new JSDOM(
      `<main><h1 data-od-id="hero">Hero</h1></main>${bridge}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const hero = dom.window.document.querySelector('[data-od-id="hero"]') as HTMLElement;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: {
        type: 'od-edit-preview-style',
        id: 'hero',
        styles: { fontSize: '32', fontWeight: '700' },
        version: 4,
      },
    }));

    expect(hero.style.getPropertyValue('font-size')).toBe('32px');
    expect(hero.style.getPropertyValue('font-weight')).toBe('700');

    dom.window.close();
  });

  it('clears the important flag when a preview style value is emptied', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="hero" style="font-size: 42px !important">Hero</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const hero = dom.window.document.querySelector('[data-od-id="hero"]') as HTMLElement;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: {
        type: 'od-edit-preview-style',
        id: 'hero',
        styles: { fontSize: '' },
        version: 2,
      },
    }));

    expect(hero.style.getPropertyValue('font-size')).toBe('');

    dom.window.close();
  });

  it('moves the runtime selected marker between selected targets', () => {
    const dom = new JSDOM(
      `<main>
        <h1 data-od-id="title">Title</h1>
        <p data-od-id="body">Body</p>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]')!;
    const body = dom.window.document.querySelector('[data-od-id="body"]')!;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'title' },
    }));
    expect(title.getAttribute('data-od-edit-selected')).toBe('true');
    expect(body.hasAttribute('data-od-edit-selected')).toBe(false);

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'body' },
    }));
    expect(title.hasAttribute('data-od-edit-selected')).toBe(false);
    expect(body.getAttribute('data-od-edit-selected')).toBe('true');

    dom.window.close();
  });

  it('clears runtime selected markers for null selection and edit-mode exit', () => {
    const dom = new JSDOM(
      `<main>
        <h1 data-od-id="title">Title</h1>
        <p data-od-id="body" data-od-edit-selected="true">Body</p>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const body = dom.window.document.querySelector('[data-od-id="body"]')!;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: null },
    }));
    expect(body.hasAttribute('data-od-edit-selected')).toBe(false);

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'body' },
    }));
    expect(body.getAttribute('data-od-edit-selected')).toBe('true');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: false },
    }));
    expect(body.hasAttribute('data-od-edit-selected')).toBe(false);

    dom.window.close();
  });

  it('keeps runtime selection marker out of source-shaped target data', () => {
    const bridge = buildManualEditBridge(true);

    expect(bridge).toContain("attr.name === 'data-od-edit-selected'");
    expect(bridge).toContain('replace(/\\sdata-od-edit-selected="[^"]*"/g, \'\')');
    expect(bridge).toContain('[data-od-edit-selected]');
    expect(bridge).toContain('data-od-edit-host-chrome');
  });

  it('suppresses nested rest outlines and host-chrome selected rings', () => {
    const css = buildManualEditBridgeStyle();
    expect(css).toContain('[data-od-source-path] [data-od-source-path] { outline-color: transparent; }');
    expect(css).toContain('[data-od-edit-selected][data-od-edit-host-chrome]');
    expect(css).toContain('outline: none !important');
    expect(css).toContain('pointer-events: none !important');
  });

  it('marks hostChrome selection so iframe outline can yield to the overlay', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]')!;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'title', hostChrome: true },
    }));
    expect(title.getAttribute('data-od-edit-selected')).toBe('true');
    expect(title.getAttribute('data-od-edit-host-chrome')).toBe('true');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'title', hostChrome: false },
    }));
    expect(title.getAttribute('data-od-edit-selected')).toBe('true');
    expect(title.hasAttribute('data-od-edit-host-chrome')).toBe(false);

    dom.window.close();
  });

  it('starts contenteditable from host od-edit-start-text-edit (overlay dblclick)', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]')!;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-start-text-edit', id: 'title' },
    }));
    expect(title.getAttribute('contenteditable')).toBe('plaintext-only');
    expect(title.getAttribute('data-od-editing')).toBe('true');

    dom.window.close();
  });

  it('marks flex/grid targets as layout containers', () => {
    const bridge = buildManualEditBridge(true);

    expect(bridge).toContain('isLayoutContainer: isLayoutContainer(el)');
    expect(bridge).toContain("display.indexOf('flex') >= 0 || display.indexOf('grid') >= 0");
  });

  it('marks multiple runtime selected targets from ids payload', () => {
    const dom = new JSDOM(
      `<main>
        <h1 data-od-id="title">Title</h1>
        <p data-od-id="body">Body</p>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]')!;
    const body = dom.window.document.querySelector('[data-od-id="body"]')!;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', ids: ['title', 'body'], primaryId: 'body' },
    }));
    expect(title.getAttribute('data-od-edit-selected')).toBe('true');
    expect(body.getAttribute('data-od-edit-selected')).toBe('true');
    expect(body.getAttribute('data-od-edit-primary')).toBe('true');
    expect(title.hasAttribute('data-od-edit-primary')).toBe(false);

    dom.window.close();
  });

  it('forwards Delete and Backspace to the host as od-edit-key when not typing', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="hero">Hero</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const hero = dom.window.document.querySelector('[data-od-id="hero"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    hero.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Delete',
    }));
    hero.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Backspace',
    }));

    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-key', key: 'Delete' }, '*');
    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-key', key: 'Backspace' }, '*');

    dom.window.close();
  });

  it('does not forward Delete while an inline editing host is active', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="hero" data-od-editing="true" contenteditable="plaintext-only">Hero</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const hero = dom.window.document.querySelector('[data-od-id="hero"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    hero.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Delete',
    }));

    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'od-edit-key' }),
      '*',
    );

    dom.window.close();
  });

  it('posts additive selection when shift-clicking a target', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    title.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      clientX: 8,
      clientY: 8,
    }));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-select',
      target: expect.objectContaining({ id: 'title', kind: 'text' }),
      additive: true,
    }, '*');

    dom.window.close();
  });

  it('single-clicks text to select without entering inline edit (resize stays available)', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Original title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    title.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 8,
      clientY: 8,
    }));

    expect(title.hasAttribute('contenteditable')).toBe(false);
    expect(title.hasAttribute('data-od-editing')).toBe(false);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-select',
      target: expect.objectContaining({
        id: 'title',
        kind: 'text',
      }),
      additive: false,
    }, '*');
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'od-edit-text-active',
      active: true,
    }), '*');

    dom.window.close();
  });

  it('double-clicks text targets into inline editors and commits changed text', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Original title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    title.dispatchEvent(new dom.window.MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      clientX: 8,
      clientY: 8,
    }));
    expect(title.getAttribute('contenteditable')).toBe('plaintext-only');
    expect(title.getAttribute('data-od-editing')).toBe('true');
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'od-edit-select',
      target: expect.objectContaining({
        id: 'title',
        kind: 'text',
      }),
      additive: false,
    }), '*');

    title.textContent = 'Edited title';
    title.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: false }));

    expect(title.hasAttribute('contenteditable')).toBe(false);
    expect(title.hasAttribute('data-od-editing')).toBe(false);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-text-active',
      active: false,
    }, '*');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-text-commit',
      id: 'title',
      value: 'Edited title',
      flattenNestedMarkup: true,
    }, '*');

    dom.window.close();
  });

  it('announces inline text editing and stops arrow keys in capture phase', () => {
    const bridge = buildManualEditBridge(true);
    expect(bridge).toContain("type: 'od-edit-text-active'");
    expect(bridge).toContain('stopImmediatePropagation');
    expect(bridge).toContain('onKeyCapture');
  });

  it('lets plain Enter insert a newline; commits with Cmd/Ctrl+Enter or blur', () => {
    const bridge = buildManualEditBridge(true);
    // Regression: Enter used to call finish(true) and confirm the edit.
    expect(bridge).not.toContain("ev.key === 'Enter' && !ev.shiftKey");
    expect(bridge).toContain("ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)");
    expect(bridge).toContain('plainTextFrom');
    expect(bridge).toContain("tag === 'br'");
    expect(bridge).not.toContain('var value = (el.textContent || \'\').trim()');
  });

  it('preserves <br> line breaks on blur commit and does not strip them as unchanged', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Line one<br>Line two</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    title.dispatchEvent(new dom.window.MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      clientX: 8,
      clientY: 8,
    }));
    // No user edits — blur must not invent a flattened "Line oneLine two" commit.
    title.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: false }));

    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'od-edit-text-commit',
    }), '*');
    expect(title.innerHTML).toContain('<br');

    dom.window.close();
  });

  it('commits multiline plain text with newlines preserved', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Original</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    title.dispatchEvent(new dom.window.MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
    }));
    title.innerHTML = 'First line<br>Second line';
    title.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: false }));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-text-commit',
      id: 'title',
      value: 'First line\nSecond line',
      flattenNestedMarkup: true,
    }, '*');

    dom.window.close();
  });

  it('does not confirm the edit on plain Enter', () => {
    const dom = new JSDOM(
      `<main><p data-od-id="body">Original body</p></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const body = dom.window.document.querySelector('[data-od-id="body"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    body.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      shiftKey: false,
    }));

    expect(body.getAttribute('contenteditable')).toBe('plaintext-only');
    expect(body.getAttribute('data-od-editing')).toBe('true');
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'od-edit-text-commit',
    }), '*');

    dom.window.close();
  });

  it('cancels inline text edits with Escape without posting a commit', () => {
    const dom = new JSDOM(
      `<main><p data-od-id="body">Original body</p></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const body = dom.window.document.querySelector('[data-od-id="body"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    body.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    body.textContent = 'Draft body';
    body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    }));

    expect(body.textContent).toBe('Original body');
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'od-edit-text-commit',
    }), '*');

    dom.window.close();
  });

  it('posts od-edit-rect after od-edit-remeasure for a mapped target', async () => {
    const posts: Array<{ type?: string; id?: string; ok?: boolean; target?: { id: string; rect?: { width: number } } }> = [];
    const dom = new JSDOM(
      `<main><div data-od-id="card" style="width:120px;height:80px">Card</div></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const card = dom.window.document.querySelector('[data-od-id="card"]')!;
    card.getBoundingClientRect = () => ({
      x: 10, y: 20, width: 120, height: 80,
      top: 20, right: 130, bottom: 100, left: 10,
      toJSON: () => ({}),
    } as DOMRect);
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string; id?: string; ok?: boolean; target?: { id: string; rect?: { width: number } } });
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-remeasure', id: 'card' },
    }));

    const rectMessage = posts.find((message) => message.type === 'od-edit-rect');
    expect(rectMessage).toMatchObject({ id: 'card', ok: true });
    expect(rectMessage?.target?.id).toBe('card');
    expect(rectMessage?.target?.rect?.width).toBe(120);

    dom.window.close();
  });

  it('blocks clicks on unmapped elements while edit mode is enabled', () => {
    const dom = new JSDOM(
      `<main><button id="cta">Launch</button></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const button = dom.window.document.getElementById('cta') as HTMLButtonElement;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);

    const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    const result = button.dispatchEvent(event);

    expect(result).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(clicked).not.toHaveBeenCalled();

    dom.window.close();
  });

  it('reports geometry styles as authored/inline only (no computed bake)', async () => {
    const posts: Array<{ type?: string; target?: { id: string; styles?: Record<string, string> } }> = [];
    const dom = new JSDOM(
      `<style>[data-od-id="card"] { width: 320px; }</style>
      <main><div data-od-id="card" style="position:absolute;left:10px;height:80px">Box</div></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const cardEl = dom.window.document.querySelector('[data-od-id="card"]') as HTMLElement;
    cardEl.getBoundingClientRect = () => ({
      x: 10, y: 10, width: 320, height: 80,
      top: 10, right: 330, bottom: 90, left: 10,
      toJSON: () => ({}),
    } as DOMRect);
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as typeof posts[number]);
    }) as typeof dom.window.parent.postMessage;

    cardEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

    const select = posts.find((p) => p.type === 'od-edit-select');
    expect(select?.target?.styles?.position).toBe('absolute');
    expect(select?.target?.styles?.left).toBe('10px');
    expect(select?.target?.styles?.height).toBe('80px');
    // Stylesheet-only width must not appear as if it were inline.
    expect(select?.target?.styles?.width).toBe('');

    dom.window.close();
  });

  it('answers od-edit-remeasure with od-edit-rect for the target id', () => {
    const posts: Array<{
      type?: string;
      id?: string;
      ok?: boolean;
      target?: {
        id?: string;
        rect?: { x: number; y: number; width: number; height: number };
        layoutWidth?: number;
        layoutHeight?: number;
        offsetLeft?: number;
        offsetTop?: number;
        cssPosition?: string;
      };
    }> = [];
    const dom = new JSDOM(
      `<main><div data-od-id="card" style="position:absolute;left:12px;top:24px">Box</div></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const card = dom.window.document.querySelector('[data-od-id="card"]') as HTMLElement;
    card.getBoundingClientRect = () => ({
      x: 12, y: 24, width: 160, height: 90,
      top: 24, right: 172, bottom: 114, left: 12,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(card, 'offsetWidth', { value: 320, configurable: true });
    Object.defineProperty(card, 'offsetHeight', { value: 180, configurable: true });
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as typeof posts[number]);
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-remeasure', id: 'card' },
    }));

    const rectMsg = posts.find((p) => p.type === 'od-edit-rect');
    expect(rectMsg).toMatchObject({
      type: 'od-edit-rect',
      id: 'card',
      ok: true,
      target: {
        id: 'card',
        rect: { x: 12, y: 24, width: 160, height: 90 },
        layoutWidth: 320,
        layoutHeight: 180,
        cssPosition: 'absolute',
      },
    });
    expect(typeof rectMsg?.target?.offsetLeft).toBe('number');
    expect(typeof rectMsg?.target?.offsetTop).toBe('number');

    dom.window.close();
  });

  it('uses a transform ancestor as the absolute containing block for offsetLeft', () => {
    const posts: Array<{
      type?: string;
      id?: string;
      ok?: boolean;
      target?: { offsetLeft?: number; offsetTop?: number };
    }> = [];
    const dom = new JSDOM(
      `<main>
        <div id="host" style="position: static;">
          <div data-od-id="box" style="position:absolute;left:40px;top:60px;width:100px;height:50px">Box</div>
        </div>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const host = dom.window.document.getElementById('host')!;
    const box = dom.window.document.querySelector('[data-od-id="box"]') as HTMLElement;
    host.getBoundingClientRect = () => ({
      x: 100, y: 200, width: 400, height: 300,
      top: 200, right: 500, bottom: 500, left: 100,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(host, 'clientLeft', { value: 0 });
    Object.defineProperty(host, 'clientTop', { value: 0 });
    Object.defineProperty(host, 'scrollLeft', { value: 0 });
    Object.defineProperty(host, 'scrollTop', { value: 0 });
    // Force computed transform — jsdom may not parse inline transform as ≠ none.
    const realGetComputed = dom.window.getComputedStyle.bind(dom.window);
    dom.window.getComputedStyle = ((el: Element) => {
      const style = realGetComputed(el);
      if (el === host) {
        return new Proxy(style, {
          get(target, prop) {
            if (prop === 'transform') return 'matrix(1, 0, 0, 1, 0, 0)';
            if (prop === 'position') return 'static';
            return Reflect.get(target, prop);
          },
        }) as CSSStyleDeclaration;
      }
      return style;
    }) as typeof dom.window.getComputedStyle;
    box.getBoundingClientRect = () => ({
      x: 140, y: 260, width: 100, height: 50,
      top: 260, right: 240, bottom: 310, left: 140,
      toJSON: () => ({}),
    } as DOMRect);

    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as typeof posts[number]);
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-remeasure', id: 'box' },
    }));

    const rectMsg = posts.find((p) => p.type === 'od-edit-rect');
    // CB origin = host (100,200) → offset 40,60 — not document (0,0) → 140,260.
    expect(rectMsg?.ok).toBe(true);
    expect(rectMsg?.target?.offsetLeft).toBe(40);
    expect(rectMsg?.target?.offsetTop).toBe(60);

    dom.window.close();
  });

  it('sticky inside static scrollport: offset* use scrollport content coords (not outer CB)', () => {
    const posts: Array<{
      type?: string;
      id?: string;
      ok?: boolean;
      target?: {
        offsetLeft?: number;
        offsetTop?: number;
        stickyScrollportId?: string;
        cssPosition?: string;
      };
    }> = [];
    const dom = new JSDOM(
      `<main>
        <div id="cb" style="position:relative">
          <div id="sp" data-od-id="scrollport" style="overflow:auto;position:static;height:200px">
            <div style="height:120px"></div>
            <div data-od-id="sticky" style="position:sticky;top:0;width:100px;height:40px">S</div>
            <div style="height:400px"></div>
          </div>
        </div>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const cb = dom.window.document.getElementById('cb')!;
    const sp = dom.window.document.getElementById('sp')!;
    const sticky = dom.window.document.querySelector('[data-od-id="sticky"]') as HTMLElement;

    cb.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 400, height: 600,
      top: 0, right: 400, bottom: 600, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(cb, 'clientLeft', { value: 0 });
    Object.defineProperty(cb, 'clientTop', { value: 0 });
    Object.defineProperty(cb, 'scrollLeft', { value: 0 });
    Object.defineProperty(cb, 'scrollTop', { value: 0 });

    sp.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 400, height: 200,
      top: 0, right: 400, bottom: 200, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(sp, 'clientLeft', { value: 0 });
    Object.defineProperty(sp, 'clientTop', { value: 10 });
    Object.defineProperty(sp, 'scrollLeft', { value: 0 });
    Object.defineProperty(sp, 'scrollTop', { value: 150 });

    // Stuck sticky: visual top ≈ scrollport padding edge (clientTop).
    sticky.getBoundingClientRect = () => ({
      x: 0, y: 10, width: 100, height: 40,
      top: 10, right: 100, bottom: 50, left: 0,
      toJSON: () => ({}),
    } as DOMRect);

    const realGetComputed = dom.window.getComputedStyle.bind(dom.window);
    dom.window.getComputedStyle = ((el: Element) => {
      const style = realGetComputed(el);
      if (el === sp) {
        return new Proxy(style, {
          get(target, prop) {
            if (prop === 'position') return 'static';
            if (prop === 'overflow' || prop === 'overflowY') return 'auto';
            if (prop === 'overflowX') return 'visible';
            return Reflect.get(target, prop);
          },
        }) as CSSStyleDeclaration;
      }
      if (el === sticky) {
        return new Proxy(style, {
          get(target, prop) {
            if (prop === 'position') return 'sticky';
            return Reflect.get(target, prop);
          },
        }) as CSSStyleDeclaration;
      }
      if (el === cb) {
        return new Proxy(style, {
          get(target, prop) {
            if (prop === 'position') return 'relative';
            return Reflect.get(target, prop);
          },
        }) as CSSStyleDeclaration;
      }
      return style;
    }) as typeof dom.window.getComputedStyle;

    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as typeof posts[number]);
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-remeasure', id: 'sticky' },
    }));

    const rectMsg = posts.find((p) => p.type === 'od-edit-rect');
    // Content coords vs scrollport: top = 10 - 0 - 10 + 150 = 150 (not outer CB 10).
    expect(rectMsg?.ok).toBe(true);
    expect(rectMsg?.target?.cssPosition).toBe('sticky');
    expect(rectMsg?.target?.offsetLeft).toBe(0);
    expect(rectMsg?.target?.offsetTop).toBe(150);
    expect(rectMsg?.target?.stickyScrollportId).toBe('scrollport');

    dom.window.close();
  });

  it('sticky promote preview pins static scrollport as position:relative', () => {
    const posts: Array<{ type?: string; ok?: boolean }> = [];
    const dom = new JSDOM(
      `<main>
        <div id="sp" data-od-id="scrollport" style="overflow:auto;position:static;height:200px">
          <div data-od-id="sticky" style="position:sticky;top:0">S</div>
        </div>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const sp = dom.window.document.getElementById('sp')!;
    const sticky = dom.window.document.querySelector('[data-od-id="sticky"]') as HTMLElement;
    const realGetComputed = dom.window.getComputedStyle.bind(dom.window);
    dom.window.getComputedStyle = ((el: Element) => {
      const style = realGetComputed(el);
      if (el === sp) {
        return new Proxy(style, {
          get(target, prop) {
            if (prop === 'position') {
              return sp.style.position || 'static';
            }
            if (prop === 'overflow' || prop === 'overflowY') return 'auto';
            return Reflect.get(target, prop);
          },
        }) as CSSStyleDeclaration;
      }
      if (el === sticky) {
        return new Proxy(style, {
          get(target, prop) {
            if (prop === 'position') {
              return sticky.style.position || 'sticky';
            }
            return Reflect.get(target, prop);
          },
        }) as CSSStyleDeclaration;
      }
      return style;
    }) as typeof dom.window.getComputedStyle;

    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as typeof posts[number]);
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: {
        type: 'od-edit-preview-style',
        id: 'sticky',
        version: 1,
        styles: { position: 'absolute', left: '0px', top: '150px' },
      },
    }));

    expect(posts.some((p) => p.type === 'od-edit-preview-style-applied' && p.ok)).toBe(true);
    expect(sp.style.getPropertyValue('position')).toBe('relative');
    expect(sp.getAttribute('data-od-sticky-scrollport-cb')).toBe('1');

    dom.window.close();
  });

  it('includes stack metadata on positioned targets', async () => {
    const posts: Array<{
      type?: string;
      targets?: Array<{
        id: string;
        stackZ?: number;
        siblingIndex?: number;
        parentKey?: string;
        parentStackZ?: number;
        parentSiblingIndex?: number;
      }>;
    }> = [];
    const dom = new JSDOM(
      `<main>
        <section data-od-source-path="path-0-0">
          <div data-od-source-path="path-0-0-0" style="position:absolute;left:0;top:0;width:40px;height:40px;z-index:3"></div>
          <div data-od-source-path="path-0-0-1" style="position:absolute;left:10px;top:10px;width:40px;height:40px"></div>
        </section>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const section = dom.window.document.querySelector('section')!;
    const front = dom.window.document.querySelector('[data-od-source-path="path-0-0-0"]') as HTMLElement;
    const back = dom.window.document.querySelector('[data-od-source-path="path-0-0-1"]') as HTMLElement;
    for (const el of [section, front, back]) {
      el.getBoundingClientRect = () => ({
        x: 0, y: 0, width: 40, height: 40,
        top: 0, right: 40, bottom: 40, left: 0,
        toJSON: () => ({}),
      } as DOMRect);
    }
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as typeof posts[number]);
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const frontTarget = posts
      .find((message) => message.type === 'od-edit-targets')
      ?.targets
      ?.find((target) => target.id === 'path-0-0-0');
    const backTarget = posts
      .find((message) => message.type === 'od-edit-targets')
      ?.targets
      ?.find((target) => target.id === 'path-0-0-1');
    expect(frontTarget?.stackZ).toBe(3);
    expect(frontTarget?.siblingIndex).toBe(0);
    expect(frontTarget?.parentKey).toBe('path-0-0');
    expect(backTarget?.stackZ).toBe(0);
    expect(backTarget?.siblingIndex).toBe(1);

    dom.window.close();
  });

  it('refreshes target catalog when host posts od-edit-refresh-targets', async () => {
    const posts: Array<{ type?: string }> = [];
    const dom = new JSDOM(
      `<main><p data-od-source-path="path-0-0">Hello</p></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const paragraph = dom.window.document.querySelector('p')!;
    paragraph.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 80, height: 24,
      top: 0, right: 80, bottom: 24, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string });
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    const before = posts.filter((message) => message.type === 'od-edit-targets').length;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-refresh-targets' },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const after = posts.filter((message) => message.type === 'od-edit-targets').length;
    expect(after).toBe(before + 1);

    dom.window.close();
  });
});
