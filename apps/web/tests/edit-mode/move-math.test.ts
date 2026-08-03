import { describe, expect, it } from 'vitest';

import {
  MANUAL_EDIT_MOVE_MIN_DELTA_PX,
  canMoveOrPromoteTarget,
  canMoveTarget,
  canPromoteTarget,
  cascadeRollbackStyle,
  computeMove,
  moveHistoryLabel,
  moveResultToStyles,
  promoteMoveStyles,
  promoteMoveStylesBefore,
  promoteViewportDraft,
  startPositionFromTarget,
  viewportRectAfterMoveCommit,
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

describe('canPromoteTarget', () => {
  it('allows static / relative / sticky and not anchored', () => {
    expect(canPromoteTarget(target({ cssPosition: 'static' }))).toBe(true);
    expect(canPromoteTarget(target({ cssPosition: 'relative' }))).toBe(true);
    expect(canPromoteTarget(target({ cssPosition: 'sticky' }))).toBe(true);
    expect(canPromoteTarget(target({ cssPosition: 'absolute' }))).toBe(false);
    expect(canMoveOrPromoteTarget(target({ cssPosition: 'static' }))).toBe(true);
  });

  it('does not promote flow images/SVGs (resize-in-place; absolute images still move)', () => {
    expect(canPromoteTarget(target({
      kind: 'image',
      tagName: 'svg',
      cssPosition: 'static',
    }))).toBe(false);
    expect(canPromoteTarget(target({
      kind: 'image',
      tagName: 'img',
      cssPosition: 'relative',
    }))).toBe(false);
    expect(canMoveTarget(target({
      kind: 'image',
      tagName: 'svg',
      cssPosition: 'absolute',
    }))).toBe(true);
    expect(canMoveOrPromoteTarget(target({
      kind: 'image',
      tagName: 'svg',
      cssPosition: 'static',
    }))).toBe(false);
  });
});

describe('promoteMoveStyles', () => {
  it('sets absolute + size lock + zero margins', () => {
    const out = promoteMoveStyles(
      { x: 100, y: 200, width: 120, height: 80 },
      { leftPx: 40, topPx: 50, moved: true },
    );
    expect(out).toMatchObject({
      position: 'absolute',
      left: '40px',
      top: '50px',
      width: '120px',
      height: '80px',
      maxWidth: 'none',
      maxHeight: 'none',
      margin: '0px',
      right: '',
      bottom: '',
    });
  });

  it('locks promote size to layout px when visual startRect is transform-shrunk', () => {
    const out = promoteMoveStyles(
      { x: 40, y: 60, width: 100, height: 50 },
      { leftPx: 40, topPx: 60, moved: true },
      { layoutWidthPx: 200, layoutHeightPx: 100 },
    );
    expect(out.width).toBe('200px');
    expect(out.height).toBe('100px');
  });
});

describe('promote start / rollback helpers', () => {
  it('prefers offset over relative left/top styles for promote targets', () => {
    expect(startPositionFromTarget(target({
      cssPosition: 'relative',
      offsetLeft: 80,
      offsetTop: 90,
      styles: { ...emptyManualEditStyles(), left: '10px', top: '5px' },
      rect: { x: 200, y: 300, width: 100, height: 50 },
    }))).toEqual({ startLeftPx: 80, startTopPx: 90 });
  });

  it('rolls back static/auto to empty and keeps relative', () => {
    expect(cascadeRollbackStyle('static')).toBe('');
    expect(cascadeRollbackStyle('auto')).toBe('');
    expect(cascadeRollbackStyle('relative')).toBe('relative');
    expect(promoteMoveStylesBefore(target({
      cssPosition: 'relative',
      styles: { ...emptyManualEditStyles(), position: 'relative', left: '10px', width: 'auto' },
    }))).toMatchObject({
      position: 'relative',
      left: '10px',
      width: '',
    });
  });

  it('maps promote CSS delta onto viewport overlay draft', () => {
    expect(promoteViewportDraft(
      { x: 100, y: 200, width: 120, height: 80 },
      40,
      50,
      { leftPx: 60, topPx: 70, moved: true },
    )).toEqual({ x: 120, y: 220 });
  });

  it('keeps viewport x/y on move commit when CB left/top differ', () => {
    expect(viewportRectAfterMoveCommit(
      { x: 160, y: 180, width: 100, height: 60 },
      100,
      60,
    )).toEqual({ x: 160, y: 180, width: 100, height: 60 });
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

  it('prefers offsetLeft/offsetTop over rect when styles are empty', () => {
    expect(startPositionFromTarget(target({
      styles: emptyManualEditStyles(),
      offsetLeft: 8,
      offsetTop: 16,
      rect: { x: 100, y: 200, width: 80, height: 40 },
    }))).toEqual({ startLeftPx: 8, startTopPx: 16 });
  });
});
