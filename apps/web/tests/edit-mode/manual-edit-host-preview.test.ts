// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  applyManualEditPreviewStylesToDocument,
  measureManualEditContentPageBounds,
  measureManualEditTargetContentRect,
  measureManualEditTargetHostRect,
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

  it('ignores non-allowlisted preview style keys', () => {
    const doc = makeDoc('<main data-od-id="hero">Hero</main>');
    const ok = applyManualEditPreviewStylesToDocument(doc, 'hero', {
      fontSize: '28px',
      backgroundImage: 'url(https://evil.example/x.png)',
      behavior: 'url(#xss)',
    } as Partial<import('../../src/edit-mode/types').ManualEditStyles>);
    const el = doc.querySelector('[data-od-id="hero"]') as HTMLElement;

    expect(ok).toBe(true);
    expect(el.style.getPropertyValue('font-size')).toBe('28px');
    expect(el.style.getPropertyValue('background-image')).toBe('');
    expect(el.style.getPropertyValue('behavior')).toBe('');
  });

  it('coerces unitless length strings so preview matches persist', () => {
    const doc = makeDoc('<main data-od-id="hero">Hero</main>');
    const ok = applyManualEditPreviewStylesToDocument(doc, 'hero', {
      fontSize: '32',
      fontWeight: '700',
    });
    const el = doc.querySelector('[data-od-id="hero"]') as HTMLElement;

    expect(ok).toBe(true);
    expect(el.style.getPropertyValue('font-size')).toBe('32px');
    expect(el.style.getPropertyValue('font-weight')).toBe('700');
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

  it('skips host chrome siblings when resolving path-* ids', () => {
    const doc = makeDoc(
      [
        '<script data-od-sandbox-shim></script>',
        '<p>Copy</p>',
        '<script data-od-edit-bridge></script>',
      ].join(''),
    );
    const ok = applyManualEditPreviewStylesToDocument(doc, 'path-0', { fontSize: '30px' });
    const el = doc.querySelector('p') as HTMLElement;

    expect(ok).toBe(true);
    expect(el.style.getPropertyValue('font-size')).toBe('30px');
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

    Object.defineProperty(el, 'offsetWidth', { value: 320 });
    Object.defineProperty(el, 'offsetHeight', { value: 160 });
    expect(measureManualEditTargetContentRect(frame, 'card')).toEqual({
      rect: { x: 12, y: 24, width: 160, height: 80 },
      layoutWidth: 320,
      layoutHeight: 160,
    });
    frame.remove();
  });

  it('projects the element into host content coordinates through iframe scale', () => {
    const host = document.createElement('div');
    const frame = document.createElement('iframe');
    document.body.append(host, frame);
    const doc = frame.contentDocument!;
    doc.body.innerHTML = '<div data-od-id="card">Card</div>';
    const el = doc.querySelector('[data-od-id="card"]') as HTMLElement;
    el.getBoundingClientRect = () => ({
      x: 20, y: 10, width: 100, height: 50,
      top: 10, left: 20, right: 120, bottom: 60,
      toJSON: () => ({}),
    }) as DOMRect;
    host.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 800, height: 600,
      top: 0, left: 0, right: 800, bottom: 600,
      toJSON: () => ({}),
    }) as DOMRect;
    frame.getBoundingClientRect = () => ({
      x: 40, y: 80, width: 400, height: 300,
      top: 80, left: 40, right: 440, bottom: 380,
      toJSON: () => ({}),
    }) as DOMRect;
    Object.defineProperty(frame, 'offsetWidth', { value: 800 });
    Object.defineProperty(frame, 'offsetHeight', { value: 600 });
    Object.defineProperty(host, 'clientLeft', { value: 0 });
    Object.defineProperty(host, 'clientTop', { value: 0 });
    Object.defineProperty(host, 'scrollLeft', { value: 16 });
    Object.defineProperty(host, 'scrollTop', { value: 32 });
    Object.defineProperty(frame, 'clientLeft', { value: 0 });
    Object.defineProperty(frame, 'clientTop', { value: 0 });

    // scale 0.5: host = iframeOrigin + content*scale + scroll
    expect(measureManualEditTargetHostRect(frame, host, 'card')).toEqual({
      x: 40 + 20 * 0.5 + 16,
      y: 80 + 10 * 0.5 + 32,
      width: 50,
      height: 25,
    });
    frame.remove();
    host.remove();
  });

  it('measures iframe content page bounds from design-canvas when present', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    const canvas = doc.createElement('div');
    canvas.className = 'design-canvas';
    doc.body.appendChild(canvas);
    canvas.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 960, height: 540,
      top: 0, left: 0, right: 960, bottom: 540,
      toJSON: () => ({}),
    }) as DOMRect;

    expect(measureManualEditContentPageBounds(frame)).toEqual({
      x: 0,
      y: 0,
      width: 960,
      height: 540,
    });
    frame.remove();
  });
});
