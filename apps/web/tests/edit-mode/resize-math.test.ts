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
  resizeHistoryLabel,
  resizeResultToStyles,
  resizeStylesForCommit,
  resizeViewportOrigin,
  startAnchorFromTarget,
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
  it('parses explicit px only', () => {
    expect(parseExplicitPx('320px')).toBe(320);
    expect(parseExplicitPx('auto')).toBeNull();
    expect(parseExplicitPx('50%')).toBeNull();
  });

  it('starts from rect when style is auto', () => {
    expect(startSizeFromTarget(target({
      styles: { ...emptyManualEditStyles(), width: 'auto', height: '' },
      rect: { x: 0, y: 0, width: 180, height: 90 },
    }))).toEqual({ widthPx: 180, heightPx: 90 });
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
