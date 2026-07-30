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
};

export type ResizeMathInput = ResizeSessionStart & {
  /** content-space pointer delta from pointerdown */
  dx: number;
  dy: number;
};

export type ResizeMathResult = {
  widthPx: number;
  heightPx: number;
  /** Phase 1: position unchanged (reserved). */
  x: number;
  y: number;
  /** Which axes were driven by this handle (for partial set-style). */
  touchedWidth: boolean;
  touchedHeight: boolean;
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

/**
 * Image: aspect locked by default; Shift unlocks.
 * Others: free by default; Shift locks.
 */
export function aspectLockForTarget(kind: ManualEditKind, shiftKey: boolean): boolean {
  if (kind === 'image') return !shiftKey;
  return shiftKey;
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
    // Corner: dominate by larger absolute content delta (dx wins ties).
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

  return {
    widthPx: Math.round(widthPx),
    heightPx: Math.round(heightPx),
    x: startRect.x,
    y: startRect.y,
    touchedWidth: touchedWidth || aspectLock,
    touchedHeight: touchedHeight || aspectLock,
  };
}

/** Parse a CSS length to px when it is already px; otherwise null (use computed). */
export function parseExplicitPx(value: string | null | undefined): number | null {
  const trimmed = String(value ?? '').trim().toLowerCase();
  if (!trimmed || trimmed === 'auto' || trimmed === 'none') return null;
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(trimmed);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Start size for a drag session: prefer computed rect (border-box), which
 * already reflects % / auto / rem. Persist always writes px.
 */
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

export function resizeResultToStyles(
  result: ResizeMathResult,
): Partial<ManualEditStyles> {
  const styles: Partial<ManualEditStyles> = {};
  if (result.touchedWidth) styles.width = `${result.widthPx}px`;
  if (result.touchedHeight) styles.height = `${result.heightPx}px`;
  return styles;
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
