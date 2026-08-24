// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc, PREVIEW_ESCAPE_MESSAGE } from '../../src/runtime/srcdoc';

function extractPreviewEscapeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-preview-escape-bridge>([\s\S]*?)<\/script>/);
  if (!match || !match[1]) {
    throw new Error('preview escape bridge script not found in srcdoc');
  }
  return match[1];
}

function setupEscapeBridge(bodyHtml = '<main>Preview</main>') {
  const srcdoc = buildSrcdoc(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  const script = extractPreviewEscapeScript(srcdoc);
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
  win.eval(script);
  return { win, parentPostMessage };
}

describe('srcdoc preview Escape bridge', () => {
  it('posts od:preview-escape when Escape is pressed in the iframe', () => {
    const { win, parentPostMessage } = setupEscapeBridge();

    win.document.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(parentPostMessage).toHaveBeenCalledWith(
      { type: PREVIEW_ESCAPE_MESSAGE },
      '*',
    );
  });

  it('does not post Escape while typing in an input', () => {
    const { win, parentPostMessage } = setupEscapeBridge(
      '<label>Name <input id="name" /></label>',
    );
    const input = win.document.getElementById('name');
    if (!input) throw new Error('expected input');

    input.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(parentPostMessage).not.toHaveBeenCalled();
  });

  it('does not post Escape while editing a contenteditable node', () => {
    const { win, parentPostMessage } = setupEscapeBridge(
      '<p id="edit" contenteditable="true">Draft</p>',
    );
    const edit = win.document.getElementById('edit');
    if (!edit) throw new Error('expected contenteditable');

    edit.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(parentPostMessage).not.toHaveBeenCalled();
  });
});
