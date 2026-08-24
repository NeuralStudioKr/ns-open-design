// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildLayerReorderZIndexPatches,
  canDragLayerRow,
  layerReorderGroupFrontFirstIds,
  layerReorderInsertIndex,
  mergeVisibleLayerReorderIntoStack,
  reorderLayerPaintOrder,
  resolveLayerReorderSiblings,
  resolveLayerReorderStackSiblings,
} from '../../src/edit-mode/manual-edit-layer-reorder';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

function target(
  id: string,
  options: {
    parentKey?: string;
    stackZ?: number;
    siblingIndex?: number;
    cssPosition?: string;
    zIndex?: string;
    slideIndex?: number;
  } = {},
): ManualEditTarget {
  return {
    id,
    kind: 'container',
    label: id,
    tagName: 'div',
    className: '',
    text: id,
    rect: { x: 0, y: 0, width: 40, height: 40 },
    parentKey: options.parentKey ?? 'parent',
    stackZ: options.stackZ,
    siblingIndex: options.siblingIndex,
    slideIndex: options.slideIndex,
    fields: {},
    attributes: { 'data-od-id': id },
    styles: {
      ...emptyManualEditStyles(),
      zIndex: options.zIndex ?? '',
      position: options.cssPosition ?? 'absolute',
    },
    cssPosition: options.cssPosition ?? 'absolute',
    isLayoutContainer: false,
    outerHtml: `<div data-od-id="${id}">${id}</div>`,
  };
}

describe('manual-edit-layer-reorder', () => {
  it('resolves siblings that share a parent', () => {
    const targets = [
      target('a', { parentKey: 'slide', siblingIndex: 0 }),
      target('b', { parentKey: 'slide', siblingIndex: 1 }),
      target('c', { parentKey: 'other', siblingIndex: 0 }),
    ];
    expect(resolveLayerReorderSiblings(targets, 'a').map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('reorders front-first ids and assigns z-index patches back-to-front', () => {
    const siblings = [
      target('back', { stackZ: 1, siblingIndex: 0 }),
      target('front', { stackZ: 3, siblingIndex: 1 }),
    ];
    const frontFirst = layerReorderGroupFrontFirstIds(siblings);
    expect(frontFirst).toEqual(['front', 'back']);
    const nextOrder = reorderLayerPaintOrder(frontFirst, 'back', 0);
    expect(nextOrder).toEqual(['back', 'front']);
    const patches = buildLayerReorderZIndexPatches(siblings, nextOrder);
    expect(patches).toEqual(expect.arrayContaining([
      { id: 'back', styles: { zIndex: '2' } },
      { id: 'front', styles: { zIndex: '1' } },
    ]));
    expect(patches).toHaveLength(2);
  });

  it('promotes static siblings to relative when assigning z-index', () => {
    const siblings = [
      target('flow-a', { cssPosition: 'static', siblingIndex: 0 }),
      target('flow-b', { cssPosition: 'static', siblingIndex: 1 }),
    ];
    const patches = buildLayerReorderZIndexPatches(
      siblings,
      reorderLayerPaintOrder(['flow-b', 'flow-a'], 'flow-a', 0),
    );
    expect(patches).toEqual(expect.arrayContaining([
      {
        id: 'flow-a',
        styles: { position: 'relative', zIndex: '2' },
      },
      {
        id: 'flow-b',
        styles: { position: 'relative', zIndex: '1' },
      },
    ]));
    expect(patches).toHaveLength(2);
  });

  it('only allows drag when every sibling is visible in the panel', () => {
    const all = [
      target('a'),
      target('b'),
      target('c'),
    ];
    const panel = [all[0]!, all[1]!];
    expect(canDragLayerRow(all[0]!, panel, all)).toBe(false);
    expect(canDragLayerRow(all[0]!, all, all)).toBe(true);
  });

  it('computes insert index before a sibling or at the back', () => {
    const order = ['top', 'middle', 'bottom'];
    expect(layerReorderInsertIndex(order, 'bottom', 'top')).toBe(0);
    expect(layerReorderInsertIndex(order, 'top', null)).toBe(2);
  });

  it('keeps hidden siblings interleaved when visible layers reorder', () => {
    const stack = [
      target('visible-top', { parentKey: 'slide', stackZ: 3, siblingIndex: 2 }),
      target('hidden', { parentKey: 'slide', stackZ: 2, siblingIndex: 1, cssPosition: 'absolute' }),
      target('visible-bottom', { parentKey: 'slide', stackZ: 1, siblingIndex: 0 }),
    ];
    stack[1]!.isHidden = true;
    const visible = resolveLayerReorderSiblings(stack, 'visible-bottom');
    const visibleFrontFirst = layerReorderGroupFrontFirstIds(visible);
    const visibleNext = reorderLayerPaintOrder(visibleFrontFirst, 'visible-bottom', 0);
    const merged = mergeVisibleLayerReorderIntoStack(stack, visibleFrontFirst, visibleNext);
    expect(merged).toEqual(['visible-bottom', 'hidden', 'visible-top']);
    const patches = buildLayerReorderZIndexPatches(
      resolveLayerReorderStackSiblings(stack, 'visible-bottom'),
      merged,
    );
    expect(patches.length).toBeGreaterThan(0);
  });
});
