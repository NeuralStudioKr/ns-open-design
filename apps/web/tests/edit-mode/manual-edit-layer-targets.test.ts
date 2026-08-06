// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  compareManualEditLayerPaintOrder,
  filterManualEditLayerTargets,
  sortManualEditLayerTargetsByPaintOrder,
} from '../../src/edit-mode/manual-edit-layer-targets';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

function target(
  id: string,
  rect: { x: number; y: number; width: number; height: number },
  options: {
    slideIndex?: number;
    stackZ?: number;
    siblingIndex?: number;
    parentStackZ?: number;
    parentSiblingIndex?: number;
    label?: string;
  } = {},
): ManualEditTarget {
  const label = options.label ?? id;
  return {
    id,
    kind: 'text',
    label,
    tagName: 'div',
    className: '',
    text: id,
    rect,
    slideIndex: options.slideIndex,
    stackZ: options.stackZ,
    siblingIndex: options.siblingIndex,
    parentStackZ: options.parentStackZ,
    parentSiblingIndex: options.parentSiblingIndex,
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
      target('a', { x: 10, y: 10, width: 40, height: 20 }, { slideIndex: 0 }),
      target('b', { x: 20, y: 20, width: 40, height: 20 }, { slideIndex: 1 }),
      target('c', { x: 30, y: 30, width: 40, height: 20 }),
    ];
    const filtered = filterManualEditLayerTargets(targets, {
      deck: true,
      activeSlideIndex: 1,
    });
    expect(filtered.map((item) => item.id)).toEqual(['b', 'c']);
  });

  it('sorts layers front-most first by stackZ then siblingIndex', () => {
    const targets = [
      target('back', { x: 0, y: 0, width: 40, height: 20 }, { stackZ: 0, siblingIndex: 0 }),
      target('front', { x: 10, y: 10, width: 40, height: 20 }, { stackZ: 5, siblingIndex: 1 }),
      target('middle', { x: 20, y: 20, width: 40, height: 20 }, { stackZ: 2, siblingIndex: 2 }),
    ];
    expect(sortManualEditLayerTargetsByPaintOrder(targets).map((item) => item.id)).toEqual([
      'front',
      'middle',
      'back',
    ]);
  });

  it('uses siblingIndex when stackZ ties', () => {
    const targets = [
      target('first', { x: 0, y: 0, width: 40, height: 20 }, { stackZ: 1, siblingIndex: 0 }),
      target('last', { x: 10, y: 10, width: 40, height: 20 }, { stackZ: 1, siblingIndex: 2 }),
      target('middle', { x: 20, y: 20, width: 40, height: 20 }, { stackZ: 1, siblingIndex: 1 }),
    ];
    expect(sortManualEditLayerTargetsByPaintOrder(targets).map((item) => item.id)).toEqual([
      'last',
      'middle',
      'first',
    ]);
  });

  it('compares parent stack metadata before child stackZ', () => {
    const a = target('a', { x: 0, y: 0, width: 40, height: 20 }, {
      parentSiblingIndex: 1,
      parentStackZ: 10,
      stackZ: 0,
      siblingIndex: 0,
    });
    const b = target('b', { x: 0, y: 0, width: 40, height: 20 }, {
      parentSiblingIndex: 0,
      parentStackZ: 10,
      stackZ: 99,
      siblingIndex: 1,
    });
    expect(compareManualEditLayerPaintOrder(a, b)).toBeLessThan(0);
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
