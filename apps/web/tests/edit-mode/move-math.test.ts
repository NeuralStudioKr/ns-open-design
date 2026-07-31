import { describe, expect, it } from 'vitest';

import {
  MANUAL_EDIT_MOVE_MIN_DELTA_PX,
  canMoveTarget,
  computeMove,
  moveHistoryLabel,
  moveResultToStyles,
  startPositionFromTarget,
} from '../../src/edit-mode/move-math';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

function target(over: Partial<ManualEditTarget> = {}): ManualEditTarget {
  return {
    id: 'card',
    kind: 'container',
    label: 'Card',
    tagName: 'div',
    className: 'card',
    text: '',
    rect: { x: 40, y: 60, width: 200, height: 100 },
    fields: {},
    attributes: {},
    styles: { ...emptyManualEditStyles(), left: '40px', top: '60px' },
    isLayoutContainer: true,
    cssPosition: 'absolute',
    outerHtml: '',
    ...over,
  };
}

describe('canMoveTarget', () => {
  it('allows absolute / fixed only', () => {
    expect(canMoveTarget(target({ cssPosition: 'absolute' }))).toBe(true);
    expect(canMoveTarget(target({ cssPosition: 'fixed' }))).toBe(true);
    expect(canMoveTarget(target({ cssPosition: 'static' }))).toBe(false);
    expect(canMoveTarget(target({ cssPosition: 'relative' }))).toBe(false);
  });

  it('rejects slide roots and edit-off / text-edit', () => {
    expect(canMoveTarget(target({
      tagName: 'section',
      className: 'slide',
      attributes: {},
    }))).toBe(false);
    expect(canMoveTarget(target(), { editMode: false })).toBe(false);
    expect(canMoveTarget(target(), { inlineTextEditing: true })).toBe(false);
  });
});

describe('computeMove', () => {
  it('translates left/top by content deltas', () => {
    const out = computeMove({
      startLeftPx: 40,
      startTopPx: 60,
      startRect: { x: 40, y: 60, width: 200, height: 100 },
      minDeltaPx: MANUAL_EDIT_MOVE_MIN_DELTA_PX,
      dx: 20,
      dy: 10,
    });
    expect(out).toEqual({ leftPx: 60, topPx: 70, moved: true });
    expect(moveResultToStyles(out)).toEqual({
      left: '60px',
      top: '70px',
      right: '',
      bottom: '',
    });
  });

  it('locks to the dominant axis when Shift is held', () => {
    const horizontal = computeMove({
      startLeftPx: 40,
      startTopPx: 60,
      startRect: { x: 40, y: 60, width: 200, height: 100 },
      minDeltaPx: MANUAL_EDIT_MOVE_MIN_DELTA_PX,
      dx: 30,
      dy: 8,
      shiftKey: true,
    });
    expect(horizontal).toEqual({ leftPx: 70, topPx: 60, moved: true });

    const vertical = computeMove({
      startLeftPx: 40,
      startTopPx: 60,
      startRect: { x: 40, y: 60, width: 200, height: 100 },
      minDeltaPx: MANUAL_EDIT_MOVE_MIN_DELTA_PX,
      dx: 8,
      dy: 30,
      shiftKey: true,
    });
    expect(vertical).toEqual({ leftPx: 40, topPx: 90, moved: true });
  });

  it('ignores sub-threshold jitter', () => {
    const out = computeMove({
      startLeftPx: 40,
      startTopPx: 60,
      startRect: { x: 40, y: 60, width: 200, height: 100 },
      minDeltaPx: MANUAL_EDIT_MOVE_MIN_DELTA_PX,
      dx: 1,
      dy: 0,
    });
    expect(out.moved).toBe(false);
    expect(moveResultToStyles(out)).toEqual({});
  });

  it('starts from rect when left/top styles are empty', () => {
    expect(startPositionFromTarget(target({
      styles: emptyManualEditStyles(),
      rect: { x: 12, y: 34, width: 80, height: 40 },
    }))).toEqual({ startLeftPx: 12, startTopPx: 34 });
    expect(moveHistoryLabel('Card')).toBe('Move: Card');
  });
});
