import type { ManualEditKind, ManualEditStyles } from './types';
import { aspectLockForTarget, MANUAL_EDIT_RESIZE_MIN_PX } from './resize-eligibility';

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export type ResizeSessionStart = {
  startRect: { x: number; y: number; width: number; height: number };
  startWidthPx: number;
  startHeightPx: number;
  aspect: number;
  handle: ResizeHandle;
  aspectLock: boolean;
  minWidth: number;
  minHeight: number;
};

export type ResizeMathInput = ResizeSessionStart & {
  dx: number;
  dy: number;
};

export type ResizeMathResult = {
  widthPx: number;
  heightPx: number;
  x: number;
  y: number;
};

const HANDLE_SIGNS: Record<ResizeHandle, { w: number; h: number }> = {
  e: { w: 1, h: 0 },
  w: { w: -1, h: 0 },
  s: { w: 0, h: 1 },
  n: { w: 0, h: -1 },
  se: { w: 1, h: 1 },
  sw: { w: -1, h: 1 },
  ne: { w: 1, h: -1 },
  nw: { w: -1, h: -1 },
};

function clamp(value: number, min: number): number {
  return Math.max(min, value);
}

export function parseManualEditStylePx(value: string | undefined, fallbackPx: number): number {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === 'auto') return Math.round(fallbackPx);
  const pxMatch = /^(-?\d+(?:\.\d+)?)\s*px$/i.exec(trimmed);
  if (pxMatch) return Math.round(Number(pxMatch[1]));
  const numeric = Number.parseFloat(trimmed);
  if (Number.isFinite(numeric)) return Math.round(numeric);
  return Math.round(fallbackPx);
}

export function buildResizeSessionStart(
  targetRect: { x: number; y: number; width: number; height: number },
  styles: Pick<ManualEditStyles, 'width' | 'height'>,
  handle: ResizeHandle,
  kind: ManualEditKind,
  shiftKey: boolean,
): ResizeSessionStart {
  const startWidthPx = parseManualEditStylePx(styles.width, targetRect.width);
  const startHeightPx = parseManualEditStylePx(styles.height, targetRect.height);
  const safeHeight = startHeightPx > 0 ? startHeightPx : MANUAL_EDIT_RESIZE_MIN_PX;
  return {
    startRect: targetRect,
    startWidthPx,
    startHeightPx,
    aspect: startWidthPx / safeHeight,
    handle,
    aspectLock: aspectLockForTarget(kind, shiftKey),
    minWidth: MANUAL_EDIT_RESIZE_MIN_PX,
    minHeight: MANUAL_EDIT_RESIZE_MIN_PX,
  };
}

export function computeResize(input: ResizeMathInput): ResizeMathResult {
  const signs = HANDLE_SIGNS[input.handle];
  let widthPx = input.startWidthPx;
  let heightPx = input.startHeightPx;

  if (input.aspectLock && signs.w !== 0 && signs.h !== 0) {
    const deltaW = signs.w * input.dx;
    const deltaH = signs.h * input.dy;
    if (Math.abs(deltaW) >= Math.abs(deltaH)) {
      widthPx = clamp(input.startWidthPx + deltaW, input.minWidth);
      heightPx = clamp(Math.round(widthPx / input.aspect), input.minHeight);
    } else {
      heightPx = clamp(input.startHeightPx + deltaH, input.minHeight);
      widthPx = clamp(Math.round(heightPx * input.aspect), input.minWidth);
    }
  } else {
    if (signs.w !== 0) {
      widthPx = clamp(input.startWidthPx + signs.w * input.dx, input.minWidth);
    }
    if (signs.h !== 0) {
      heightPx = clamp(input.startHeightPx + signs.h * input.dy, input.minHeight);
    }
    if (input.aspectLock) {
      if (signs.w !== 0 && signs.h === 0) {
        heightPx = clamp(Math.round(widthPx / input.aspect), input.minHeight);
      } else if (signs.h !== 0 && signs.w === 0) {
        widthPx = clamp(Math.round(heightPx * input.aspect), input.minWidth);
      }
    }
  }

  return {
    widthPx: Math.round(widthPx),
    heightPx: Math.round(heightPx),
    x: input.startRect.x,
    y: input.startRect.y,
  };
}

export function resizeStylesForCommit(
  result: ResizeMathResult,
  handle: ResizeHandle,
): Partial<ManualEditStyles> {
  const signs = HANDLE_SIGNS[handle];
  const styles: Partial<ManualEditStyles> = {};
  if (signs.w !== 0) styles.width = `${result.widthPx}px`;
  if (signs.h !== 0) styles.height = `${result.heightPx}px`;
  return styles;
}

export { aspectLockForTarget };
