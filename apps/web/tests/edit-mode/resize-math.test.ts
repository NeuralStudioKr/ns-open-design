import { describe, expect, it } from 'vitest';

import { hostDeltaToContentDelta, contentRectToHostRect } from '../../src/edit-mode/preview-coords';
import {
  MANUAL_EDIT_RESIZE_MIN_PX,
  aspectLockForTarget,
  canResizeTarget,
  computeResize,
  isDeckSlideRoot,
  parseExplicitPx,
  resizeResultToStyles,
  startSizeFromTarget,
  type ResizeMathInput,
} from '../../src/edit-mode/resize-math';
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
    });
    expect(styles).toEqual({ width: '220px' });
  });
});
