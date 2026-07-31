import type { ManualEditKind, ManualEditRect, ManualEditStyles, ManualEditTarget } from './types';
import {
  aspectLockForTarget,
  MANUAL_EDIT_RESIZE_MIN_PX,
} from './resize-eligibility';

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export { aspectLockForTarget, MANUAL_EDIT_RESIZE_MIN_PX };
/** Ignore tiny handle jitter so a plain click does not flush a resize. */
export const MANUAL_EDIT_RESIZE_MIN_DELTA_PX = 2;

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
    // left/top are containing-block relative; x/y stay viewport (startRect + Δ).
    if (signW < 0 && startLeftPx != null) {
      leftPx = Math.round(startLeftPx + (startWidthPx - widthPx));
    }
    if (signH < 0 && startTopPx != null) {
      topPx = Math.round(startTopPx + (startHeightPx - heightPx));
    }
  }
  const viewport = resizeViewportOrigin(startRect, startLeftPx, startTopPx, leftPx, topPx);
  x = viewport.x;
  y = viewport.y;

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

/**
 * Host overlay viewport origin while W/N-resizing an absolute/fixed box.
 * CSS left/top are CB-relative — never assign them to rect.x/y.
 */
export function resizeViewportOrigin(
  startRect: ManualEditRect,
  startLeftPx: number | null,
  startTopPx: number | null,
  leftPx: number | null,
  topPx: number | null,
): { x: number; y: number } {
  return {
    x: leftPx != null && startLeftPx != null
      ? startRect.x + (leftPx - startLeftPx)
      : startRect.x,
    y: topPx != null && startTopPx != null
      ? startRect.y + (topPx - startTopPx)
      : startRect.y,
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
    // Prefer explicit style, then CB offset (bridge promoteCoords), then viewport.
    // Falling straight to rect.x writes viewport coords into CB left (nested absolute).
    startLeftPx: Math.round(
      parseExplicitPx(target.styles.left) ?? target.offsetLeft ?? target.rect.x,
    ),
    startTopPx: Math.round(
      parseExplicitPx(target.styles.top) ?? target.offsetTop ?? target.rect.y,
    ),
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
  // Match move: clear opposing edges so right:0 / bottom:0 cannot pin the box
  // after an anchored W/N (or corner) resize.
  if (result.leftPx != null || result.touchedWidth) styles.right = '';
  if (result.topPx != null || result.touchedHeight) styles.bottom = '';
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


/** Staging-compatible px parser used by FileViewer resize draft helpers. */
export function parseManualEditStylePx(value: string | undefined, fallbackPx: number): number {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === 'auto') return Math.round(fallbackPx);
  const pxMatch = /^(-?\d+(?:\.\d+)?)\s*px$/i.exec(trimmed);
  if (pxMatch) return Math.round(Number(pxMatch[1]));
  const numeric = Number.parseFloat(trimmed);
  if (Number.isFinite(numeric)) return Math.round(numeric);
  return Math.round(fallbackPx);
}

/** Staging-compatible session builder (no CB anchor — use startAnchorFromTarget for W/N). */
export function buildResizeSessionStart(
  targetRect: { x: number; y: number; width: number; height: number },
  styles: Pick<ManualEditStyles, 'width' | 'height'>,
  handle: ResizeHandle,
  kind: ManualEditKind,
  shiftKey: boolean,
): Omit<ResizeSessionStart, 'anchorPosition' | 'startLeftPx' | 'startTopPx'> & {
  anchorPosition?: boolean;
  startLeftPx?: number | null;
  startTopPx?: number | null;
} {
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
    anchorPosition: false,
    startLeftPx: null,
    startTopPx: null,
  };
}

/** Staging-compatible width/height-only commit styles (no left/top). */
export function resizeStylesForCommit(
  result: Pick<ResizeMathResult, 'widthPx' | 'heightPx'> & Partial<Pick<ResizeMathResult, 'touchedWidth' | 'touchedHeight'>>,
  handle: ResizeHandle,
): Partial<ManualEditStyles> {
  const { signW, signH } = axisSigns(handle);
  const styles: Partial<ManualEditStyles> = {};
  if (signW !== 0 || result.touchedWidth) styles.width = `${result.widthPx}px`;
  if (signH !== 0 || result.touchedHeight) styles.height = `${result.heightPx}px`;
  return styles;
}
