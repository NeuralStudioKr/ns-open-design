import { describe, expect, it } from 'vitest';

import { hostDeltaToContentDelta, contentRectToHostRect } from '../../src/edit-mode/preview-coords';
import {
  MANUAL_EDIT_RESIZE_MIN_PX,
  aspectLockForTarget,
  buildResizeSessionStart,
  canResizeTarget,
  computeResize,
  isAnchoredCssPosition,
  isDeckSlideRoot,
  parseExplicitPx,
  parseManualEditStylePx,
  resizeHandleFromHostPoint,
  resizeHistoryLabel,
  resizeResultToStyles,
  resizeStylesForCommit,
  resizeViewportOrigin,
  startAnchorFromTarget,
  resizeFreezeContentRect,
  shouldPromoteInlineTargetForResize,
  startSizeFromTarget,
  type ResizeMathInput,
} from '../../src/edit-mode/resize-math';
// staging compat helpers imported below via same module
import type { ManualEditTarget } from '../../src/edit-mode/types';
import { emptyManualEditStyles } from '../../src/edit-mode/types';

function baseInput(over: Partial<ResizeMathInput> = {}): ResizeMathInput {
  return {
    startRect: { x: 10, y: 20, width: 200, height: 100 },
    startWidthPx: 200,
    startHeightPx: 100,
    aspect: 2,
    handle: 'se',
    aspectLock: false,
    minWidth: MANUAL_EDIT_RESIZE_MIN_PX,
    minHeight: MANUAL_EDIT_RESIZE_MIN_PX,
    anchorPosition: false,
    startLeftPx: null,
    startTopPx: null,
    dx: 0,
    dy: 0,
    ...over,
  };
}

function target(over: Partial<ManualEditTarget> = {}): ManualEditTarget {
  return {
    id: 'card',
    kind: 'container',
    label: 'Card',
    tagName: 'div',
    className: 'card',
    text: '',
    rect: { x: 0, y: 0, width: 200, height: 100 },
    fields: {},
    attributes: {},
    styles: emptyManualEditStyles(),
    isLayoutContainer: true,
    outerHtml: '',
    ...over,
  };
}

describe('computeResize', () => {
  it('grows SE freely', () => {
    const out = computeResize(baseInput({ handle: 'se', dx: 20, dy: 10 }));
    expect(out.widthPx).toBe(220);
    expect(out.heightPx).toBe(110);
    expect(out.touchedWidth).toBe(true);
    expect(out.touchedHeight).toBe(true);
  });

  it('grows E without changing height', () => {
    const out = computeResize(baseInput({ handle: 'e', dx: 20, dy: 99 }));
    expect(out.widthPx).toBe(220);
    expect(out.heightPx).toBe(100);
    expect(out.touchedWidth).toBe(true);
    expect(out.touchedHeight).toBe(false);
  });

  it('keeps aspect on SE when locked (dx dominates)', () => {
    const out = computeResize(baseInput({
      handle: 'se',
      aspectLock: true,
      dx: 40,
      dy: 5,
    }));
    expect(out.widthPx).toBe(240);
    expect(out.heightPx).toBe(120);
  });

  it('clamps to min size', () => {
    const out = computeResize(baseInput({
      handle: 'se',
      dx: -1000,
      dy: -1000,
    }));
    expect(out.widthPx).toBe(MANUAL_EDIT_RESIZE_MIN_PX);
    expect(out.heightPx).toBe(MANUAL_EDIT_RESIZE_MIN_PX);
  });

  it('locks height when E edge dragged with aspect lock', () => {
    const out = computeResize(baseInput({
      handle: 'e',
      aspectLock: true,
      dx: 40,
      dy: 0,
    }));
    expect(out.widthPx).toBe(240);
    expect(out.heightPx).toBe(120);
    expect(out.touchedWidth).toBe(true);
    expect(out.touchedHeight).toBe(true);
  });
});

describe('aspectLockForTarget', () => {
  it('locks images by default and unlocks with Shift', () => {
    expect(aspectLockForTarget('image', false)).toBe(true);
    expect(aspectLockForTarget('image', true)).toBe(false);
  });

  it('unlocks containers by default and locks with Shift', () => {
    expect(aspectLockForTarget('container', false)).toBe(false);
    expect(aspectLockForTarget('container', true)).toBe(true);
  });

  it('keeps image SE resize on aspect unless Shift unlocks', () => {
    const locked = computeResize(baseInput({
      handle: 'se',
      startWidthPx: 200,
      startHeightPx: 100,
      aspect: 2,
      aspectLock: aspectLockForTarget('image', false),
      dx: 40,
      dy: 80,
    }));
    expect(locked.widthPx / locked.heightPx).toBeCloseTo(2, 5);

    const unlocked = computeResize(baseInput({
      handle: 'se',
      startWidthPx: 200,
      startHeightPx: 100,
      aspect: 2,
      aspectLock: aspectLockForTarget('image', true),
      dx: 40,
      dy: 80,
    }));
    expect(unlocked.widthPx).toBe(240);
    expect(unlocked.heightPx).toBe(180);
  });
});

describe('preview coords', () => {
  it('scales content rect to host', () => {
    expect(contentRectToHostRect({ x: 10, y: 20, width: 100, height: 50 }, 0.75)).toEqual({
      x: 7.5,
      y: 15,
      width: 75,
      height: 37.5,
    });
  });

  it('converts host delta to content at scale 0.75', () => {
    expect(hostDeltaToContentDelta(30, 15, 0.75)).toEqual({ dx: 40, dy: 20 });
  });
});

describe('canResizeTarget / slide root', () => {
  it('rejects token, hidden, slide root, tiny rects, text editing', () => {
    expect(canResizeTarget(target({ kind: 'token' }))).toBe(false);
    expect(canResizeTarget(target({ isHidden: true }))).toBe(false);
    expect(canResizeTarget(target({
      tagName: 'section',
      className: 'slide active',
    }))).toBe(false);
    expect(isDeckSlideRoot(target({
      tagName: 'section',
      className: 'slide',
    }))).toBe(true);
    expect(canResizeTarget(target({
      rect: { x: 0, y: 0, width: 2, height: 100 },
    }))).toBe(false);
    expect(canResizeTarget(target(), { inlineTextEditing: true })).toBe(false);
  });

  it('allows container / image / text', () => {
    expect(canResizeTarget(target())).toBe(true);
    expect(canResizeTarget(target({ kind: 'image' }))).toBe(true);
    expect(canResizeTarget(target({ kind: 'text', tagName: 'p' }))).toBe(true);
  });
});

describe('style helpers', () => {
  it('promotes inline SVG for resize so width/height CSS can apply', () => {
    expect(shouldPromoteInlineTargetForResize(target({
      kind: 'image',
      tagName: 'svg',
      styles: emptyManualEditStyles(),
    }))).toBe(true);
    expect(resizeResultToStyles({
      widthPx: 360,
      heightPx: 360,
      x: 0,
      y: 0,
      touchedWidth: true,
      touchedHeight: true,
      leftPx: null,
      topPx: null,
    }, target({
      kind: 'image',
      tagName: 'svg',
      styles: emptyManualEditStyles(),
    }))).toMatchObject({
      display: 'inline-block',
      width: '360px',
      height: '360px',
    });
  });

  it('parses explicit px only', () => {
    expect(parseExplicitPx('320px')).toBe(320);
    expect(parseExplicitPx('auto')).toBeNull();
    expect(parseExplicitPx('50%')).toBeNull();
  });

  it('starts from painted rect even when authored px is smaller', () => {
    expect(startSizeFromTarget(target({
      styles: { ...emptyManualEditStyles(), width: 'auto', height: '' },
      rect: { x: 0, y: 0, width: 180, height: 90 },
    }))).toEqual({ widthPx: 180, heightPx: 90 });
    // Authored 100px but used/min-width box is 300 — grow must start at 300.
    expect(startSizeFromTarget(target({
      styles: { ...emptyManualEditStyles(), width: '100px', height: '50px' },
      rect: { x: 0, y: 0, width: 300, height: 150 },
    }))).toEqual({ widthPx: 300, heightPx: 150 });
  });

  it('image: recovers style width/height when a broken <img> collapses layout+rect to 0', () => {
    // Broken / not-yet-loaded <img>: offsetWidth and getBoundingClientRect can
    // both collapse to 0 while `style="width:400px;height:300px"` stays. Prior
    // behavior returned 1×1 → resize overlay started at 1px and any drag
    // delta jumped visibly (the "drag box weird" symptom the user hit).
    expect(startSizeFromTarget(target({
      kind: 'image',
      tagName: 'img',
      styles: { ...emptyManualEditStyles(), width: '400px', height: '300px' },
      rect: { x: 200, y: 100, width: 0, height: 0 },
      layoutWidth: 0,
      layoutHeight: 0,
    }))).toEqual({ widthPx: 400, heightPx: 300 });
    // Non-image target with only style px still returns 1 — the fallback is
    // image-specific to keep the flow-text / container invariants above intact.
    expect(startSizeFromTarget(target({
      kind: 'container',
      tagName: 'div',
      styles: { ...emptyManualEditStyles(), width: '400px', height: '300px' },
      rect: { x: 200, y: 100, width: 0, height: 0 },
      layoutWidth: 0,
      layoutHeight: 0,
    }))).toEqual({ widthPx: 1, heightPx: 1 });
  });

  it('prefers layout offset size over transform-shrunk getBoundingClientRect', () => {
    // Deck-stage fit scale 0.5: visual rect 100×50, layout still 200×100.
    // Writing visual as CSS width was the grow→shrink / one-char column bug.
    expect(startSizeFromTarget(target({
      kind: 'text',
      tagName: 'p',
      styles: { ...emptyManualEditStyles(), width: '', height: '' },
      rect: { x: 40, y: 60, width: 100, height: 50 },
      layoutWidth: 200,
      layoutHeight: 100,
    }))).toEqual({ widthPx: 200, heightPx: 100 });

    expect(resizeFreezeContentRect(target({
      rect: { x: 40, y: 60, width: 100, height: 50 },
      layoutWidth: 200,
      layoutHeight: 100,
    }))).toEqual({ x: 40, y: 60, width: 200, height: 100 });

    // East grow from layout: +40 layout px → 240, never collapses to visual 100.
    const east = computeResize(baseInput({
      startRect: { x: 40, y: 60, width: 100, height: 50 },
      startWidthPx: 200,
      startHeightPx: 100,
      handle: 'e',
      dx: 40,
      dy: 0,
    }));
    expect(east.widthPx).toBe(240);
    expect(east.heightPx).toBe(100);
    expect(resizeResultToStyles(east).width).toBe('240px');
  });

  it('maps host overlay edge hits to resize handles (interior stays null)', () => {
    expect(resizeHandleFromHostPoint(2, 50, 200, 100)).toBe('w');
    expect(resizeHandleFromHostPoint(198, 50, 200, 100)).toBe('e');
    expect(resizeHandleFromHostPoint(100, 2, 200, 100)).toBe('n');
    expect(resizeHandleFromHostPoint(100, 98, 200, 100)).toBe('s');
    expect(resizeHandleFromHostPoint(2, 2, 200, 100)).toBe('nw');
    expect(resizeHandleFromHostPoint(198, 98, 200, 100)).toBe('se');
    expect(resizeHandleFromHostPoint(100, 50, 200, 100)).toBeNull();
  });

  it('omits untouched axes in set-style payload', () => {
    const styles = resizeResultToStyles({
      widthPx: 220,
      heightPx: 100,
      x: 0,
      y: 0,
      touchedWidth: true,
      touchedHeight: false,
      leftPx: null,
      topPx: null,
    });
    expect(styles).toEqual({ width: '220px', maxWidth: 'none', right: '' });
    // Text/fontSize and other style keys must never ride along with a box resize.
    expect(Object.keys(styles).sort()).toEqual(['maxWidth', 'right', 'width']);
  });

  it('lifts max-width/height clamps so responsive CSS cannot pin used size', () => {
    expect(resizeResultToStyles({
      widthPx: 240,
      heightPx: 120,
      x: 0,
      y: 0,
      touchedWidth: true,
      touchedHeight: true,
      leftPx: null,
      topPx: null,
    })).toEqual({
      width: '240px',
      height: '120px',
      maxWidth: 'none',
      maxHeight: 'none',
      right: '',
      bottom: '',
    });
  });

  it('clears right/bottom only when W/N wrote the near-edge anchor', () => {
    expect(resizeResultToStyles({
      widthPx: 160,
      heightPx: 80,
      x: 50,
      y: 40,
      touchedWidth: true,
      touchedHeight: true,
      leftPx: 140,
      topPx: 70,
    })).toEqual({
      width: '160px',
      height: '80px',
      maxWidth: 'none',
      maxHeight: 'none',
      left: '140px',
      top: '70px',
      right: '',
      bottom: '',
    });
  });

  it('disables handles while inline text editing or edit mode is off', () => {
    expect(canResizeTarget(target(), { editMode: false })).toBe(false);
    expect(canResizeTarget(target(), { inlineTextEditing: true })).toBe(false);
    expect(canResizeTarget(target({ kind: 'text', tagName: 'p' }))).toBe(true);
  });

  it('anchors left when W-dragging an absolute element', () => {
    expect(isAnchoredCssPosition('absolute')).toBe(true);
    const out = computeResize(baseInput({
      handle: 'w',
      dx: 40,
      anchorPosition: true,
      startLeftPx: 100,
      startTopPx: 50,
    }));
    // width 200-40=160, left moves +40 to keep right edge fixed
    expect(out.widthPx).toBe(160);
    expect(out.leftPx).toBe(140);
    expect(out.topPx).toBeNull();
    // startRect.x=10 → viewport x = 10 + (140-100) = 50 (not CB left 140)
    expect(out.x).toBe(50);
    expect(resizeResultToStyles(out)).toEqual({
      width: '160px',
      maxWidth: 'none',
      left: '140px',
      right: '',
    });
  });

  it('anchors top when N-dragging an absolute element', () => {
    const out = computeResize(baseInput({
      handle: 'n',
      dy: 20,
      anchorPosition: true,
      startLeftPx: 100,
      startTopPx: 50,
    }));
    expect(out.heightPx).toBe(80);
    expect(out.topPx).toBe(70);
    expect(out.leftPx).toBeNull();
    // startRect.y=20 → viewport y = 20 + (70-50) = 40
    expect(out.y).toBe(40);
  });

  it('pins left/top on absolute E/S so grow is not eaten by right/bottom pins', () => {
    const east = computeResize(baseInput({
      handle: 'e',
      dx: 40,
      anchorPosition: true,
      startLeftPx: 100,
      startTopPx: 50,
    }));
    expect(east.widthPx).toBe(240);
    expect(east.leftPx).toBe(100);
    expect(east.x).toBe(10);
    expect(resizeResultToStyles(east)).toEqual({
      width: '240px',
      maxWidth: 'none',
      left: '100px',
      right: '',
    });

    const south = computeResize(baseInput({
      handle: 's',
      dy: 30,
      anchorPosition: true,
      startLeftPx: 100,
      startTopPx: 50,
    }));
    expect(south.heightPx).toBe(130);
    expect(south.topPx).toBe(50);
    expect(resizeResultToStyles(south)).toMatchObject({
      height: '130px',
      top: '50px',
      bottom: '',
    });
  });

  it('maps CB left Δ onto viewport overlay origin', () => {
    expect(resizeViewportOrigin(
      { x: 160, y: 180, width: 200, height: 100 },
      40,
      60,
      80,
      60,
    )).toEqual({ x: 200, y: 180 });
  });

  it('prefers offsetLeft over viewport rect when style left is missing', () => {
    expect(startAnchorFromTarget(target({
      cssPosition: 'absolute',
      offsetLeft: 40,
      offsetTop: 60,
      rect: { x: 160, y: 180, width: 200, height: 100 },
      styles: { ...emptyManualEditStyles(), width: '200px', height: '100px' },
    }))).toEqual({
      anchorPosition: true,
      startLeftPx: 40,
      startTopPx: 60,
    });
  });

  it('does not write left/top for static flow layout', () => {
    const out = computeResize(baseInput({ handle: 'w', dx: 40 }));
    expect(out.leftPx).toBeNull();
    expect(startAnchorFromTarget(target({ cssPosition: 'static' })).anchorPosition).toBe(false);
    expect(resizeHistoryLabel('Card')).toBe('Resize: Card');
  });
});

describe('resize-math staging compat', () => {
  it('grows width and height for SE without aspect lock', () => {
    const start = buildResizeSessionStart(
      { x: 0, y: 0, width: 100, height: 50 },
      { width: '100px', height: '50px' },
      'se',
      'container',
      false,
    );
    const result = computeResize({ ...start, dx: 20, dy: 10 });
    expect(result).toMatchObject({ widthPx: 120, heightPx: 60 });
  });

  it('changes width only for east handle', () => {
    const start = buildResizeSessionStart(
      { x: 0, y: 0, width: 100, height: 50 },
      { width: '100px', height: '50px' },
      'e',
      'container',
      false,
    );
    const result = computeResize({ ...start, dx: 20, dy: 0 });
    expect(result).toMatchObject({ widthPx: 120, heightPx: 50 });
    expect(resizeStylesForCommit(result, 'e')).toEqual({ width: '120px', maxWidth: 'none' });
  });

  it('keeps aspect ratio when locked on corner drag', () => {
    const start = buildResizeSessionStart(
      { x: 0, y: 0, width: 200, height: 100 },
      { width: '200px', height: '100px' },
      'se',
      'image',
      false,
    );
    const result = computeResize({ ...start, dx: 40, dy: 5 });
    expect(result.widthPx / result.heightPx).toBeCloseTo(2, 5);
  });

  it('clamps to minimum size', () => {
    const start = buildResizeSessionStart(
      { x: 0, y: 0, width: 30, height: 30 },
      { width: '30px', height: '30px' },
      'nw',
      'container',
      false,
    );
    const result = computeResize({ ...start, dx: 20, dy: 20 });
    expect(result.widthPx).toBeGreaterThanOrEqual(24);
    expect(result.heightPx).toBeGreaterThanOrEqual(24);
  });

  it('parses px styles and falls back to rect size', () => {
    expect(parseManualEditStylePx('320px', 100)).toBe(320);
    expect(parseManualEditStylePx('auto', 88)).toBe(88);
  });

  it('locks aspect for containers only when shift is held', () => {
    const start = buildResizeSessionStart(
      { x: 0, y: 0, width: 200, height: 100 },
      { width: '200px', height: '100px' },
      'se',
      'container',
      true,
    );
    expect(start.aspectLock).toBe(true);
    const unlocked = buildResizeSessionStart(
      { x: 0, y: 0, width: 200, height: 100 },
      { width: '200px', height: '100px' },
      'se',
      'container',
      false,
    );
    const result = computeResize({ ...unlocked, dx: 40, dy: 5 });
    expect(result.widthPx).toBe(240);
    expect(result.heightPx).toBe(105);
  });

  it('defaults image corner drags to aspect lock unless shift frees it', () => {
    const locked = buildResizeSessionStart(
      { x: 0, y: 0, width: 200, height: 100 },
      { width: '200px', height: '100px' },
      'se',
      'image',
      false,
    );
    expect(locked.aspectLock).toBe(true);
    const unlocked = buildResizeSessionStart(
      { x: 0, y: 0, width: 200, height: 100 },
      { width: '200px', height: '100px' },
      'se',
      'image',
      true,
    );
    expect(unlocked.aspectLock).toBe(false);
    const result = computeResize({ ...unlocked, dx: 40, dy: 5 });
    expect(result.widthPx).toBe(240);
    expect(result.heightPx).toBe(105);
  });

  it('scales host delta into content delta before resize math', () => {
    const contentDelta = hostDeltaToContentDelta(15, 7.5, 0.75);
    const start = buildResizeSessionStart(
      { x: 0, y: 0, width: 100, height: 50 },
      { width: '100px', height: '50px' },
      'se',
      'container',
      false,
    );
    const result = computeResize({ ...start, ...contentDelta });
    expect(result).toMatchObject({ widthPx: 120, heightPx: 60 });
  });
});
