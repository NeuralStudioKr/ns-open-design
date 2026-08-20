// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  collectSnapSources,
  MANUAL_EDIT_SNAP_THRESHOLD_PX,
  snapMoveDelta,
  unionManualEditRectsList,
} from '../../src/edit-mode/manual-edit-geometry-snap';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

function target(
  id: string,
  rect: { x: number; y: number; width: number; height: number },
): ManualEditTarget {
  return {
    id,
    kind: 'text',
    label: id,
    tagName: 'div',
    className: '',
    text: id,
    rect,
    fields: { text: id },
    attributes: { 'data-od-id': id },
    styles: emptyManualEditStyles(),
    cssPosition: 'absolute',
    isLayoutContainer: false,
    outerHtml: `<div data-od-id="${id}">${id}</div>`,
  };
}

describe('manual-edit-geometry-snap', () => {
  it('snaps the moving left edge to a sibling left edge within threshold', () => {
    const moving = { x: 108, y: 40, width: 80, height: 40 };
    const sibling = { x: 100, y: 200, width: 60, height: 30 };
    const result = snapMoveDelta(
      moving,
      0,
      0,
      [{ rect: sibling, kind: 'element' }],
      { thresholdPx: 8 },
    );
    expect(result.dx).toBe(-8);
    expect(result.dy).toBe(0);
    expect(result.guides).toHaveLength(1);
    expect(result.guides[0]).toMatchObject({
      orientation: 'vertical',
      position: 100,
    });
  });

  it('snaps top edge to page top', () => {
    const moving = { x: 40, y: 3, width: 50, height: 50 };
    const page = { x: 0, y: 0, width: 1200, height: 800 };
    const result = snapMoveDelta(
      moving,
      0,
      0,
      [{ rect: page, kind: 'page' }],
      { thresholdPx: MANUAL_EDIT_SNAP_THRESHOLD_PX },
    );
    expect(result.dy).toBe(-3);
    expect(result.guides[0]).toMatchObject({
      orientation: 'horizontal',
      position: 0,
    });
  });

  it('ignores snaps outside the threshold', () => {
    const moving = { x: 50, y: 50, width: 40, height: 40 };
    const sibling = { x: 200, y: 200, width: 40, height: 40 };
    const result = snapMoveDelta(
      moving,
      0,
      0,
      [{ rect: sibling, kind: 'element' }],
    );
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.guides).toHaveLength(0);
  });

  it('snaps both axes independently', () => {
    const moving = { x: 98, y: 3, width: 40, height: 40 };
    const page = { x: 0, y: 0, width: 1200, height: 800 };
    const sibling = { x: 100, y: 300, width: 40, height: 40 };
    const result = snapMoveDelta(
      moving,
      0,
      0,
      [
        { rect: sibling, kind: 'element' },
        { rect: page, kind: 'page' },
      ],
      { thresholdPx: 5 },
    );
    expect(result.dx).toBe(2);
    expect(result.dy).toBe(-3);
    expect(result.guides).toHaveLength(2);
  });

  it('collects element sources while excluding selected ids and hidden targets', () => {
    const visible = target('a', { x: 0, y: 0, width: 10, height: 10 });
    const hidden = { ...target('b', { x: 20, y: 0, width: 10, height: 10 }), isHidden: true };
    const sources = collectSnapSources(
      [visible, hidden, target('c', { x: 30, y: 0, width: 10, height: 10 })],
      new Set(['c']),
      { x: 0, y: 0, width: 1200, height: 800 },
    );
    expect(sources).toHaveLength(2);
    expect(sources.map((item) => item.kind)).toEqual(['element', 'page']);
  });

  it('excludes descendants of selected ids from element snap sources', () => {
    const parent = target('parent', { x: 0, y: 0, width: 200, height: 200 });
    const child = target('child', { x: 20, y: 20, width: 40, height: 40 });
    const isDescendant = (childId: string, ancestorId: string) =>
      childId === 'child' && ancestorId === 'parent';
    const sources = collectSnapSources(
      [parent, child, target('other', { x: 300, y: 0, width: 10, height: 10 })],
      new Set(['parent']),
      null,
      isDescendant,
    );
    expect(sources.map((item) => item.kind)).toEqual(['element']);
  });

  it('unions member rects for group move start boxes', () => {
    const union = unionManualEditRectsList([
      { x: 10, y: 20, width: 80, height: 40 },
      { x: 120, y: 60, width: 100, height: 50 },
    ]);
    expect(union).toEqual({ x: 10, y: 20, width: 210, height: 90 });
  });
});
