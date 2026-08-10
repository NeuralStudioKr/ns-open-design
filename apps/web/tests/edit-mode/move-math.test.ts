import { describe, expect, it } from 'vitest';

import {
  MANUAL_EDIT_MOVE_MIN_DELTA_PX,
  canMoveOrPromoteTarget,
  canMoveTarget,
  canPromoteTarget,
  cascadeRollbackStyle,
  computeMove,
  isFlowImagePromoteTarget,
  moveHistoryLabel,
  moveResultToStyles,
  promoteMoveStyles,
  promoteMoveStylesBefore,
  promoteViewportDraft,
  startPositionFromTarget,
  viewportRectAfterMoveCommit,
  hostPaintRectAfterVisualMove,
  visualRectFromMoveViewportDraft,
  hostPaintRectFromVisualContent,
  MANUAL_EDIT_IDLE_REMEASURE_WILD_JUMP_PX,
  manualEditGeometryIsWildJump,
  manualEditGeometryRoughlyMatches,
  manualEditHostPaintRectStale,
  manualEditIdleRemeasureWildJumpThresholdPx,
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
  it('allows static / relative and not anchored or sticky', () => {
    expect(canPromoteTarget(target({ cssPosition: 'static' }))).toBe(true);
    expect(canPromoteTarget(target({ cssPosition: 'relative' }))).toBe(true);
    expect(canPromoteTarget(target({ cssPosition: 'sticky' }))).toBe(false);
    expect(canPromoteTarget(target({ cssPosition: 'absolute' }))).toBe(false);
    expect(canMoveOrPromoteTarget(target({ cssPosition: 'static' }))).toBe(true);
  });

  it('promotes flow inline images and SVG for body-drag move', () => {
    expect(canPromoteTarget(target({
      kind: 'image',
      tagName: 'svg',
      cssPosition: 'static',
    }))).toBe(true);
    expect(canPromoteTarget(target({
      kind: 'image',
      tagName: 'img',
      cssPosition: 'relative',
    }))).toBe(true);
    expect(isFlowImagePromoteTarget(target({
      kind: 'image',
      tagName: 'img',
      cssPosition: 'static',
    }))).toBe(true);
    expect(canMoveTarget(target({
      kind: 'image',
      tagName: 'svg',
      cssPosition: 'absolute',
    }))).toBe(true);
    expect(canMoveOrPromoteTarget(target({
      kind: 'image',
      tagName: 'img',
      cssPosition: 'static',
    }))).toBe(true);
  });

  it('promotes flow text or links on body drag (resize stays on edge/handles)', () => {
    expect(canPromoteTarget(target({
      kind: 'text',
      tagName: 'h1',
      cssPosition: 'static',
    }))).toBe(true);
    expect(canPromoteTarget(target({
      kind: 'link',
      tagName: 'a',
      cssPosition: 'relative',
    }))).toBe(true);
    expect(canMoveOrPromoteTarget(target({
      kind: 'text',
      tagName: 'span',
      cssPosition: 'static',
    }))).toBe(true);
  });
});

describe('promoteMoveStyles', () => {
  it('sets relative offsets without removing the element from flow', () => {
    const out = promoteMoveStyles(
      { x: 100, y: 200, width: 120, height: 80 },
      { leftPx: 40, topPx: 50, moved: true },
    );
    expect(out).toEqual({
      position: 'relative',
      left: '40px',
      top: '50px',
      right: '',
      bottom: '',
    });
    expect(out.width).toBeUndefined();
    expect(out.height).toBeUndefined();
    expect(out.margin).toBeUndefined();
  });

  it('does not size-lock flow card moves under deck transform', () => {
    const out = promoteMoveStyles(
      { x: 40, y: 60, width: 100, height: 50 },
      { leftPx: 40, topPx: 60, moved: true },
      { layoutWidthPx: 200, layoutHeightPx: 100 },
    );
    expect(out.position).toBe('relative');
    expect(out.width).toBeUndefined();
    expect(out.height).toBeUndefined();
  });

  it('keeps sticky absolute promotion available only for explicit low-level callers', () => {
    const out = promoteMoveStyles(
      { x: 10, y: 10, width: 100, height: 40 },
      { leftPx: 0, topPx: 150, moved: true },
      { layoutWidthPx: 200, layoutHeightPx: 80, cssPosition: 'sticky' },
    );
    expect(out).toMatchObject({
      position: 'absolute',
      left: '0px',
      top: '150px',
      width: '200px',
      height: '80px',
      margin: '0px',
      right: '',
      bottom: '',
    });
  });

  it('size-locks flow images on absolute promote', () => {
    expect(isFlowImagePromoteTarget(target({
      kind: 'image',
      tagName: 'img',
      cssPosition: 'static',
    }))).toBe(true);
    const out = promoteMoveStyles(
      { x: 40, y: 60, width: 120, height: 120 },
      { leftPx: 20, topPx: 30, moved: true },
      { layoutWidthPx: 420, layoutHeightPx: 420, imagePromote: true },
    );
    expect(out).toMatchObject({
      position: 'absolute',
      left: '20px',
      top: '30px',
      width: '420px',
      height: '420px',
      margin: '0px',
    });
  });
});

describe('promote start / rollback helpers', () => {
  it('starts from authored relative offsets for flow move targets', () => {
    expect(startPositionFromTarget(target({
      cssPosition: 'relative',
      offsetLeft: 80,
      offsetTop: 90,
      styles: { ...emptyManualEditStyles(), left: '10px', top: '5px' },
      rect: { x: 200, y: 300, width: 100, height: 50 },
    }))).toEqual({ startLeftPx: 10, startTopPx: 5 });
  });

  it('starts static flow moves from zero offsets instead of layout position', () => {
    expect(startPositionFromTarget(target({
      cssPosition: 'static',
      offsetLeft: 80,
      offsetTop: 90,
      styles: emptyManualEditStyles(),
      rect: { x: 200, y: 300, width: 100, height: 50 },
    }))).toEqual({ startLeftPx: 0, startTopPx: 0 });
  });

  it('starts sticky low-level promote from scrollport offset* (not sticky inset styles)', () => {
    expect(startPositionFromTarget(target({
      cssPosition: 'sticky',
      offsetLeft: 0,
      offsetTop: 150,
      styles: { ...emptyManualEditStyles(), top: '0px' },
      rect: { x: 0, y: 10, width: 100, height: 40 },
    }))).toEqual({ startLeftPx: 0, startTopPx: 150 });
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

  it('scales layout move delta into visual rect under deck fit-scale', () => {
    // visual 100×50, layout 200×100 (scale 0.5). Gesture viewport mixes
    // visualStart + layoutΔ (+40,+20) → hybrid 80,80. Idle must use visual 60,70.
    const start = { x: 40, y: 60, width: 100, height: 50 };
    const hybridViewport = { x: 80, y: 80 };
    expect(visualRectFromMoveViewportDraft(start, hybridViewport, 200, 100, 100, 50)).toEqual({
      x: 60,
      y: 70,
      width: 100,
      height: 50,
    });
    expect(hostPaintRectFromVisualContent(
      { x: 60, y: 70, width: 100, height: 50 },
      1,
      { x: 0, y: 0 },
    )).toEqual({ x: 60, y: 70, width: 100, height: 50 });
    // Letterboxed start paint (+12,+8) must keep offset after visual move.
    expect(hostPaintRectAfterVisualMove(
      { x: 52, y: 68, width: 100, height: 50 },
      start,
      { x: 60, y: 70, width: 100, height: 50 },
    )).toEqual({ x: 72, y: 78, width: 100, height: 50 });
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

  it('detects stale host paint that kept pre-gesture size at the same origin', () => {
    const composed = { x: 40, y: 60, width: 80, height: 40 };
    const stale = { x: 40, y: 60, width: 200, height: 100 };
    expect(manualEditHostPaintRectStale(stale, composed)).toBe(true);
    const letterboxed = { x: 120, y: 80, width: 90, height: 45 };
    const composedLarge = { x: 40, y: 60, width: 200, height: 100 };
    expect(manualEditHostPaintRectStale(letterboxed, composedLarge)).toBe(false);
  });

  it('detects stale host paint that is larger than resized composed chrome even when position also shifted', () => {
    const composed = { x: 100, y: 88, width: 120, height: 60 };
    const staleLarge = { x: 96, y: 84, width: 260, height: 130 };
    expect(manualEditHostPaintRectStale(staleLarge, composed)).toBe(true);
  });

  it('detects stale host paint that kept pre-gesture position at the same size', () => {
    const composed = { x: 140, y: 110, width: 80, height: 40 };
    const stale = { x: 40, y: 60, width: 80, height: 40 };
    expect(manualEditHostPaintRectStale(stale, composed)).toBe(true);
  });

  it('matches optimistic and measured geometry within tolerance', () => {
    const optimistic = target({
      rect: { x: 40, y: 60, width: 80, height: 40 },
      layoutWidth: 160,
      layoutHeight: 80,
    });
    const measured = {
      ...optimistic,
      rect: { x: 41, y: 61, width: 81, height: 41 },
      layoutWidth: 161,
      layoutHeight: 81,
    };
    expect(manualEditGeometryRoughlyMatches(optimistic, measured)).toBe(true);
    expect(manualEditGeometryRoughlyMatches(optimistic, {
      ...optimistic,
      rect: { x: 40, y: 60, width: 200, height: 100 },
      layoutWidth: 400,
      layoutHeight: 200,
    })).toBe(false);
  });

  it('flags idle remasure wild jumps beyond the teleport threshold', () => {
    const base = { rect: { x: 40, y: 60, width: 80, height: 40 } };
    expect(manualEditIdleRemeasureWildJumpThresholdPx(base)).toBe(MANUAL_EDIT_IDLE_REMEASURE_WILD_JUMP_PX);
    expect(manualEditGeometryIsWildJump(base, {
      rect: { x: 45, y: 65, width: 82, height: 42 },
    })).toBe(false);
    expect(manualEditGeometryIsWildJump(base, {
      rect: {
        x: 40 + MANUAL_EDIT_IDLE_REMEASURE_WILD_JUMP_PX + 1,
        y: 60,
        width: 80,
        height: 40,
      },
    })).toBe(true);
  });

  it('scales idle wild-jump threshold with large target span', () => {
    const large = { rect: { x: 0, y: 0, width: 400, height: 400 } };
    const threshold = manualEditIdleRemeasureWildJumpThresholdPx(large);
    expect(threshold).toBe(600);
    expect(manualEditGeometryIsWildJump(large, {
      rect: { x: 500, y: 0, width: 400, height: 400 },
    })).toBe(false);
    expect(manualEditGeometryIsWildJump(large, {
      rect: { x: 601, y: 0, width: 400, height: 400 },
    })).toBe(true);
  });
});
