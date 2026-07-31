// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  applyManualEditPreviewStylesToDocument,
  measureManualEditTargetContentRect,
} from '../../src/edit-mode/manual-edit-host-preview';

function makeDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('preview');
  doc.body.innerHTML = html;
  return doc;
}

describe('manual edit host preview fallback', () => {
  it('sets inline styles with !important so artifact CSS cannot mask the tweak', () => {
    const doc = makeDoc('<main data-od-id="hero" style="font-size: 12px !important">Hero</main>');
    const ok = applyManualEditPreviewStylesToDocument(doc, 'hero', {
      fontSize: '32px',
      color: 'rgb(0, 0, 255)',
    });
    const el = doc.querySelector('[data-od-id="hero"]') as HTMLElement;

    expect(ok).toBe(true);
    expect(el.style.getPropertyPriority('font-size')).toBe('important');
    expect(el.style.getPropertyValue('font-size')).toBe('32px');
    expect(el.style.getPropertyValue('color')).toBe('rgb(0, 0, 255)');
  });

  it('removes empty style values instead of writing them', () => {
    const doc = makeDoc('<main data-od-id="hero" style="font-size: 32px !important">Hero</main>');
    applyManualEditPreviewStylesToDocument(doc, 'hero', { fontSize: '' });
    const el = doc.querySelector('[data-od-id="hero"]') as HTMLElement;

    expect(el.style.getPropertyValue('font-size')).toBe('');
  });

  it('falls back to runtime and source-path lookups when data-od-id is absent', () => {
    const doc = makeDoc('<main data-od-runtime-id="path-0-0">Hero</main>');
    const ok = applyManualEditPreviewStylesToDocument(doc, 'path-0-0', { fontSize: '18px' });
    const el = doc.querySelector('[data-od-runtime-id="path-0-0"]') as HTMLElement;

    expect(ok).toBe(true);
    expect(el.style.getPropertyValue('font-size')).toBe('18px');
  });

  it('reports missing targets and null documents cleanly', () => {
    const doc = makeDoc('<main data-od-id="hero">Hero</main>');
    expect(applyManualEditPreviewStylesToDocument(doc, 'missing', { fontSize: '18px' })).toBe(false);
    expect(applyManualEditPreviewStylesToDocument(null, 'hero', { fontSize: '18px' })).toBe(false);
  });

  it('targets document.body for the special __body__ id', () => {
    const doc = makeDoc('<main data-od-id="hero">Hero</main>');
    const ok = applyManualEditPreviewStylesToDocument(doc, '__body__', {
      backgroundColor: 'rgb(0, 0, 0)',
    });

    expect(ok).toBe(true);
    expect(doc.body.style.getPropertyValue('background-color')).toBe('rgb(0, 0, 0)');
  });

  it('resolves path-* ids via child-index walk when attrs are absent', () => {
    const doc = makeDoc('<p>Copy</p>');
    const ok = applyManualEditPreviewStylesToDocument(doc, 'path-0', { fontSize: '28px' });
    const el = doc.body.children.item(0) as HTMLElement;

    expect(ok).toBe(true);
    expect(el.style.getPropertyValue('font-size')).toBe('28px');
  });

  it('measures selected target content rects from the iframe document', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.body.innerHTML = '<div data-od-id="card">Card</div>';
    const el = doc.querySelector('[data-od-id="card"]') as HTMLElement;
    el.getBoundingClientRect = () => ({
      x: 12, y: 24, width: 160, height: 80,
      top: 24, left: 12, right: 172, bottom: 104,
      toJSON: () => ({}),
    }) as DOMRect;

    expect(measureManualEditTargetContentRect(frame, 'card')).toEqual({
      x: 12,
      y: 24,
      width: 160,
      height: 80,
    });
    frame.remove();
  });
});
