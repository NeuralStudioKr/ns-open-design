import { describe, expect, it } from 'vitest';

import {
  clampFloatingPanelPosition,
  MANUAL_EDIT_PANEL_COLLAPSED_HEIGHT_PX,
  placeManualEditFloatingPanel,
  shouldRepositionFloatingPanelForSelection,
  withPinnedFloatingPanelPosition,
} from '../../src/edit-mode/floating-panel-place';

describe('placeManualEditFloatingPanel', () => {
  it('places to the right of the target when there is room', () => {
    const placed = placeManualEditFloatingPanel({
      target: { x: 80, y: 120, width: 200, height: 60 },
      canvasWidth: 1200,
      canvasHeight: 800,
      panelWidth: 320,
      panelHeight: 380,
      pad: 12,
    });
    expect(placed.placement).toBe('right');
    expect(placed.left).toBe(80 + 200 + 12);
    expect(placed.top).toBe(120);
    expect(overlap(placed, { x: 80, y: 120, width: 200, height: 60 })).toBe(0);
  });

  it('flips to the left when the right side overflows the canvas', () => {
    const placed = placeManualEditFloatingPanel({
      target: { x: 900, y: 100, width: 180, height: 48 },
      canvasWidth: 1200,
      canvasHeight: 800,
      panelWidth: 320,
      pad: 12,
    });
    expect(placed.placement).toBe('left');
    expect(placed.left).toBe(900 - 320 - 12);
    expect(overlap(placed, { x: 900, y: 100, width: 180, height: 48 })).toBe(0);
  });

  it('places below a wide centered headline instead of covering it', () => {
    // Headline spans most of the canvas — neither left nor right fits 320px.
    const target = { x: 80, y: 160, width: 1040, height: 70 };
    const placed = placeManualEditFloatingPanel({
      target,
      canvasWidth: 1200,
      canvasHeight: 800,
      panelWidth: 320,
      panelHeight: 380,
      pad: 12,
    });
    expect(placed.placement).toBe('below');
    expect(placed.top).toBeGreaterThanOrEqual(160 + 70 + 12);
    expect(overlap(placed, target)).toBe(0);
  });

  it('docks top-right when every side would collide with a near-full target', () => {
    const target = { x: 20, y: 20, width: 1160, height: 760 };
    const placed = placeManualEditFloatingPanel({
      target,
      canvasWidth: 1200,
      canvasHeight: 800,
      panelWidth: 320,
      panelHeight: 380,
      pad: 12,
    });
    expect(placed.placement).toBe('dock');
    expect(placed.left).toBe(1200 - 320 - 12);
    expect(placed.top).toBe(12);
  });

  it('keeps pinned left/top when the target rect moves during resize/move', () => {
    const initial = placeManualEditFloatingPanel({
      target: { x: 80, y: 120, width: 200, height: 60 },
      canvasWidth: 1200,
      canvasHeight: 800,
    });
    const afterMove = placeManualEditFloatingPanel({
      target: { x: 280, y: 220, width: 320, height: 90 },
      canvasWidth: 1200,
      canvasHeight: 800,
    });
    expect(afterMove.left).not.toBe(initial.left);

    const pinned = withPinnedFloatingPanelPosition(afterMove, {
      left: initial.left,
      top: initial.top,
    });
    expect(pinned.left).toBe(initial.left);
    expect(pinned.top).toBe(initial.top);
    expect(pinned.width).toBe(afterMove.width);
    expect(pinned.maxHeight).toBe(afterMove.maxHeight);
  });

  it('clamps a pinned panel back onto a smaller canvas', () => {
    expect(clampFloatingPanelPosition(
      { left: 900, top: 700 },
      { canvasWidth: 400, canvasHeight: 300, panelWidth: 320, panelHeight: 40, pad: 12 },
    )).toEqual({ left: 68, top: 248 });
  });

  it('keeps selection pin when the panel does not cover the new target', () => {
    expect(shouldRepositionFloatingPanelForSelection({
      pinned: { left: 860, top: 40 },
      target: { x: 80, y: 120, width: 200, height: 60 },
      canvasWidth: 1200,
      canvasHeight: 800,
      panelHeight: 380,
    })).toBe(false);
  });

  it('repositions when the pinned panel covers the newly selected target', () => {
    expect(shouldRepositionFloatingPanelForSelection({
      pinned: { left: 100, top: 100 },
      target: { x: 120, y: 140, width: 240, height: 80 },
      canvasWidth: 1200,
      canvasHeight: 800,
      panelHeight: 380,
    })).toBe(true);
  });

  it('uses collapsed height so a folded bar rarely forces reposition', () => {
    // Expanded 380px panel at top would cover a tall target under it; collapsed
    // chrome (40px) leaves the lower target free.
    const pinned = { left: 80, top: 12 };
    const target = { x: 90, y: 80, width: 280, height: 120 };
    expect(shouldRepositionFloatingPanelForSelection({
      pinned,
      target,
      canvasWidth: 1200,
      canvasHeight: 800,
      panelHeight: 380,
    })).toBe(true);
    expect(shouldRepositionFloatingPanelForSelection({
      pinned,
      target,
      canvasWidth: 1200,
      canvasHeight: 800,
      panelHeight: MANUAL_EDIT_PANEL_COLLAPSED_HEIGHT_PX,
    })).toBe(false);
  });
});

function overlap(
  panel: { left: number; top: number; width: number; maxHeight: number },
  target: { x: number; y: number; width: number; height: number },
): number {
  const left = Math.max(panel.left, target.x);
  const top = Math.max(panel.top, target.y);
  const right = Math.min(panel.left + panel.width, target.x + target.width);
  const bottom = Math.min(panel.top + panel.maxHeight, target.y + target.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}
