// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { filterManualEditLayerTargets } from '../../src/edit-mode/manual-edit-layer-targets';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

function target(
  id: string,
  rect: { x: number; y: number; width: number; height: number },
  slideIndex?: number,
): ManualEditTarget {
  return {
    id,
    kind: 'text',
    label: id,
    tagName: 'div',
    className: '',
    text: id,
    rect,
    slideIndex,
    fields: { text: id },
    attributes: { 'data-od-id': id },
    styles: emptyManualEditStyles(),
    cssPosition: 'absolute',
    isLayoutContainer: false,
    outerHtml: `<div data-od-id="${id}">${id}</div>`,
  };
}

describe('manual-edit-layer-targets', () => {
  it('filters deck layers to the active slide', () => {
    const targets = [
      target('a', { x: 10, y: 10, width: 40, height: 20 }, 0),
      target('b', { x: 20, y: 20, width: 40, height: 20 }, 1),
      target('c', { x: 30, y: 30, width: 40, height: 20 }),
    ];
    const filtered = filterManualEditLayerTargets(targets, {
      deck: true,
      activeSlideIndex: 1,
    });
    expect(filtered.map((item) => item.id)).toEqual(['b', 'c']);
  });

  it('filters non-deck layers to the viewport', () => {
    const targets = [
      target('visible', { x: 40, y: 40, width: 80, height: 40 }),
      target('offscreen', { x: 900, y: 40, width: 80, height: 40 }),
    ];
    const filtered = filterManualEditLayerTargets(targets, {
      viewportBounds: { x: 0, y: 0, width: 800, height: 600 },
    });
    expect(filtered.map((item) => item.id)).toEqual(['visible']);
  });
});
