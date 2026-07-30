import type { ManualEditKind, ManualEditRect, ManualEditStyles, ManualEditTarget } from './types';

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const MANUAL_EDIT_RESIZE_MIN_PX = 24;

export const RESIZE_HANDLES: ResizeHandle[] = [
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw',
];

export type ResizeSessionStart = {
  startRect: ManualEditRect;
  startWidthPx: number;
  startHeightPx: number;
  aspect: number;
  handle: ResizeHandle;
  aspectLock: boolean;
  minWidth: number;
  minHeight: number;
  /**
   * When true (absolute/fixed), W/N edges keep the opposite edge fixed by
   * writing left/top. Flow layout leaves these null.
   */
  anchorPosition: boolean;
  startLeftPx: number | null;
  startTopPx: number | null;
};

export type ResizeMathInput = ResizeSessionStart & {
  /** content-space pointer delta from pointerdown */
  dx: number;
  dy: number;
};

export type ResizeMathResult = {
  widthPx: number;
  heightPx: number;
  x: number;
  y: number;
  touchedWidth: boolean;
  touchedHeight: boolean;
  leftPx: number | null;
  topPx: number | null;
};

type AxisSign = -1 | 0 | 1;

function axisSigns(handle: ResizeHandle): { signW: AxisSign; signH: AxisSign } {
  switch (handle) {
    case 'e': return { signW: 1, signH: 0 };
    case 'w': return { signW: -1, signH: 0 };
    case 's': return { signW: 0, signH: 1 };
    case 'n': return { signW: 0, signH: -1 };
    case 'se': return { signW: 1, signH: 1 };
    case 'sw': return { signW: -1, signH: 1 };
    case 'ne': return { signW: 1, signH: -1 };
    case 'nw': return { signW: -1, signH: -1 };
    default: return { signW: 0, signH: 0 };
  }
}

function clampMin(value: number, min: number): number {
  return Math.max(min, value);
}

export function aspectLockForTarget(kind: ManualEditKind, shiftKey: boolean): boolean {
  if (kind === 'image') return !shiftKey;
  return shiftKey;
}

export function isAnchoredCssPosition(cssPosition: string | null | undefined): boolean {
  const value = String(cssPosition ?? 'static').toLowerCase();
  return value === 'absolute' || value === 'fixed';
}

export function computeResize(input: ResizeMathInput): ResizeMathResult {
  const {
    startRect,
    startWidthPx,
    startHeightPx,
    aspect,
    handle,
    aspectLock,
    minWidth,
    minHeight,
    dx,
    dy,
    anchorPosition,
    startLeftPx,
    startTopPx,
  } = input;
  const { signW, signH } = axisSigns(handle);
  const touchedWidth = signW !== 0;
  const touchedHeight = signH !== 0;
  const safeAspect = Number.isFinite(aspect) && aspect > 0
    ? aspect
    : (startHeightPx > 0 ? startWidthPx / startHeightPx : 1);

  let widthPx = startWidthPx;
  let heightPx = startHeightPx;

  if (!aspectLock) {
    if (touchedWidth) widthPx = clampMin(startWidthPx + signW * dx, minWidth);
    if (touchedHeight) heightPx = clampMin(startHeightPx + signH * dy, minHeight);
  } else if (touchedWidth && touchedHeight) {
    const useWidth = Math.abs(dx) >= Math.abs(dy);
    if (useWidth) {
      widthPx = clampMin(startWidthPx + signW * dx, minWidth);
      heightPx = clampMin(widthPx / safeAspect, minHeight);
      widthPx = clampMin(heightPx * safeAspect, minWidth);
    } else {
      heightPx = clampMin(startHeightPx + signH * dy, minHeight);
      widthPx = clampMin(heightPx * safeAspect, minWidth);
      heightPx = clampMin(widthPx / safeAspect, minHeight);
    }
  } else if (touchedWidth) {
    widthPx = clampMin(startWidthPx + signW * dx, minWidth);
    heightPx = clampMin(widthPx / safeAspect, minHeight);
    widthPx = clampMin(heightPx * safeAspect, minWidth);
  } else if (touchedHeight) {
    heightPx = clampMin(startHeightPx + signH * dy, minHeight);
    widthPx = clampMin(heightPx * safeAspect, minWidth);
    heightPx = clampMin(widthPx / safeAspect, minHeight);
  }

  widthPx = Math.round(widthPx);
  heightPx = Math.round(heightPx);

  let leftPx: number | null = null;
  let topPx: number | null = null;
  let x = startRect.x;
  let y = startRect.y;

  if (anchorPosition) {
    // Keep the opposite edge fixed: growing/shrinking from W/N moves left/top.
    if (signW < 0 && startLeftPx != null) {
      leftPx = Math.round(startLeftPx + (startWidthPx - widthPx));
      x = leftPx;
    }
    if (signH < 0 && startTopPx != null) {
      topPx = Math.round(startTopPx + (startHeightPx - heightPx));
      y = topPx;
    }
  }

  return {
    widthPx,
    heightPx,
    x,
    y,
    touchedWidth: touchedWidth || aspectLock,
    touchedHeight: touchedHeight || aspectLock,
    leftPx,
    topPx,
  };
}

export function parseExplicitPx(value: string | null | undefined): number | null {
  const trimmed = String(value ?? '').trim().toLowerCase();
  if (!trimmed || trimmed === 'auto' || trimmed === 'none') return null;
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(trimmed);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export function startSizeFromTarget(target: ManualEditTarget): {
  widthPx: number;
  heightPx: number;
} {
  const fromRectW = Math.max(1, target.rect.width);
  const fromRectH = Math.max(1, target.rect.height);
  const explicitW = parseExplicitPx(target.styles.width);
  const explicitH = parseExplicitPx(target.styles.height);
  return {
    widthPx: Math.round(explicitW ?? fromRectW),
    heightPx: Math.round(explicitH ?? fromRectH),
  };
}

export function startAnchorFromTarget(target: ManualEditTarget): {
  anchorPosition: boolean;
  startLeftPx: number | null;
  startTopPx: number | null;
} {
  const anchorPosition = isAnchoredCssPosition(target.cssPosition);
  if (!anchorPosition) {
    return { anchorPosition: false, startLeftPx: null, startTopPx: null };
  }
  return {
    anchorPosition: true,
    startLeftPx: Math.round(parseExplicitPx(target.styles.left) ?? target.rect.x),
    startTopPx: Math.round(parseExplicitPx(target.styles.top) ?? target.rect.y),
  };
}

export function resizeResultToStyles(
  result: ResizeMathResult,
): Partial<ManualEditStyles> {
  const styles: Partial<ManualEditStyles> = {};
  if (result.touchedWidth) styles.width = `${result.widthPx}px`;
  if (result.touchedHeight) styles.height = `${result.heightPx}px`;
  if (result.leftPx != null) styles.left = `${result.leftPx}px`;
  if (result.topPx != null) styles.top = `${result.topPx}px`;
  return styles;
}

/** Resize commit must flush once → one Manual Edit history entry. */
export function resizeHistoryLabel(targetLabel: string): string {
  return `Resize: ${targetLabel}`;
}

export function isDeckSlideRoot(target: ManualEditTarget): boolean {
  const tag = target.tagName.toLowerCase();
  const cls = ` ${target.className} `;
  if (tag !== 'section' && tag !== 'div') return false;
  if (/\bslide\b/.test(cls)) return true;
  if (target.attributes['data-slide'] != null) return true;
  if (target.attributes['data-slide-index'] != null) return true;
  return false;
}

export function canResizeTarget(
  target: ManualEditTarget | null | undefined,
  options?: { inlineTextEditing?: boolean; editMode?: boolean },
): boolean {
  if (!target) return false;
  if (options?.editMode === false) return false;
  if (options?.inlineTextEditing) return false;
  if (target.isHidden) return false;
  if (target.kind === 'token') return false;
  if (isDeckSlideRoot(target)) return false;
  if (target.rect.width < 4 || target.rect.height < 4) return false;
  return true;
}

export function cursorForResizeHandle(handle: ResizeHandle): string {
  switch (handle) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    default:
      return 'default';
  }
}
