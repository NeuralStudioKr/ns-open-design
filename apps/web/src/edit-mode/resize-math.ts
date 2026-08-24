import type { ManualEditKind, ManualEditRect, ManualEditStyles, ManualEditTarget } from './types';
import {
  aspectLockForTarget,
  canResizeTarget,
  isDeckSlideRoot,
  MANUAL_EDIT_RESIZE_MIN_PX,
} from './resize-eligibility';

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

// Single SSOT for eligibility — keep re-exports so move-math / tests stay stable.
export {
  aspectLockForTarget,
  canResizeTarget,
  isDeckSlideRoot,
  MANUAL_EDIT_RESIZE_MIN_PX,
};
/** Ignore tiny handle jitter so a plain click does not flush a resize. */
export const MANUAL_EDIT_RESIZE_MIN_DELTA_PX = 2;

export const RESIZE_HANDLES: ResizeHandle[] = [
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw',
];

/**
 * Host-space edge/corner band that must prefer resize over body-move.
 * When the overlay drifts from the painted element, users aim at the visual
 * edge and hit the movable body instead of the 14px handle — this slop makes
 * the whole border act as resize.
 */
export const MANUAL_EDIT_RESIZE_EDGE_SLOP_PX = 14;

/**
 * Map a pointer position inside the host overlay box to a resize handle.
 * Returns null for the interior (move zone).
 */
export function resizeHandleFromHostPoint(
  localX: number,
  localY: number,
  width: number,
  height: number,
  slopPx: number = MANUAL_EDIT_RESIZE_EDGE_SLOP_PX,
): ResizeHandle | null {
  if (!(width > 0) || !(height > 0)) return null;
  const slop = Math.max(4, Math.min(slopPx, width / 2, height / 2));
  const onW = localX <= slop;
  const onE = localX >= width - slop;
  const onN = localY <= slop;
  const onS = localY >= height - slop;
  if (onN && onW) return 'nw';
  if (onN && onE) return 'ne';
  if (onS && onW) return 'sw';
  if (onS && onE) return 'se';
  if (onN) return 'n';
  if (onS) return 's';
  if (onW) return 'w';
  if (onE) return 'e';
  return null;
}

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
    // left/top are containing-block relative; x/y stay viewport (startRect + Δ).
    if (signW < 0 && startLeftPx != null) {
      // W: move left so the opposite (E) edge stays fixed.
      leftPx = Math.round(startLeftPx + (startWidthPx - widthPx));
    } else if (signW > 0 && startLeftPx != null) {
      // E: pin left so clearing stylesheet `right` cannot reflow/shrink the box.
      leftPx = startLeftPx;
    }
    if (signH < 0 && startTopPx != null) {
      // N: move top so the opposite (S) edge stays fixed.
      topPx = Math.round(startTopPx + (startHeightPx - heightPx));
    } else if (signH > 0 && startTopPx != null) {
      // S: pin top so clearing stylesheet `bottom` cannot reflow/shrink the box.
      topPx = startTopPx;
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
  // CSS width/height are layout px. Prefer offsetWidth/Height (layoutWidth) over
  // getBoundingClientRect (`rect`): deck-stage `transform: scale` shrinks rect
  // while leaving layout large — writing rect as width collapsed text boxes
  // (grow drag → one-char-wide column). Fall back to rect when layout is absent
  // (older bridge messages / tests). Never prefer a smaller authored style px
  // (min-width / flex used size).
  //
  // Broken-image / not-yet-loaded <img>: both offsetWidth and getBoundingClientRect
  // can collapse to 0 while `styles.width` still holds the authored px. Falling
  // through to width=1 there gives a 1×1 resize overlay that jumps to any real
  // dimension on the first drag delta — visually the "drag box weird" symptom.
  // Recover the authored style px so the overlay starts at the same size the
  // user sees for the intended slot.
  const styleWidthPx = target.kind === 'image'
    ? parseExplicitPx(target.styles.width)
    : null;
  const styleHeightPx = target.kind === 'image'
    ? parseExplicitPx(target.styles.height)
    : null;
  const preferLayoutWidth =
    target.layoutWidth && target.layoutWidth >= 1 ? target.layoutWidth : null;
  const preferLayoutHeight =
    target.layoutHeight && target.layoutHeight >= 1 ? target.layoutHeight : null;
  const preferRectWidth = target.rect.width >= 1 ? target.rect.width : null;
  const preferRectHeight = target.rect.height >= 1 ? target.rect.height : null;
  const widthPx = Math.round(Math.max(
    1,
    preferLayoutWidth
      ?? preferRectWidth
      ?? (styleWidthPx && styleWidthPx >= 1 ? styleWidthPx : 0)
      ?? 0,
  ));
  const heightPx = Math.round(Math.max(
    1,
    preferLayoutHeight
      ?? preferRectHeight
      ?? (styleHeightPx && styleHeightPx >= 1 ? styleHeightPx : 0)
      ?? 0,
  ));
  return { widthPx, heightPx };
}

/**
 * Content box fed to freezeGestureHostGeom for resize: visual x/y (overlay
 * origin) + layout w/h (CSS write / pointer→layout scale). Mixing layout size
 * into width while keeping viewport x/y lets hostScale = paint/layout map both
 * E-edge growth and overlay width correctly under deck fit-scale.
 */
export function resizeFreezeContentRect(target: ManualEditTarget): ManualEditRect {
  const size = startSizeFromTarget(target);
  return {
    x: target.rect.x,
    y: target.rect.y,
    width: size.widthPx,
    height: size.heightPx,
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
  target?: ManualEditTarget | null,
): Partial<ManualEditStyles> {
  const styles: Partial<ManualEditStyles> = {};
  if ((result.touchedWidth || result.touchedHeight) && shouldPromoteInlineTargetForResize(target)) {
    styles.display = 'inline-block';
  }
  if (result.touchedWidth) {
    styles.width = `${result.widthPx}px`;
    // Responsive decks commonly ship `max-width: 100%` on images/cards.
    // width:!important does not beat max-width — used size stays clamped and
    // the drag appears to do nothing. Lift the clamp for the resized axis.
    styles.maxWidth = 'none';
  }
  if (result.touchedHeight) {
    styles.height = `${result.heightPx}px`;
    styles.maxHeight = 'none';
  }
  if (result.leftPx != null) styles.left = `${result.leftPx}px`;
  if (result.topPx != null) styles.top = `${result.topPx}px`;
  // Unpin opposing edges whenever the axis is resized. Absolute E/S paths pin
  // left/top above so clearing right/bottom grows the free edge instead of
  // letting stylesheet right:0 / bottom:0 eat the width increase.
  if (result.leftPx != null || result.touchedWidth) styles.right = '';
  if (result.topPx != null || result.touchedHeight) styles.bottom = '';
  return styles;
}

export function shouldPromoteInlineTargetForResize(
  target: ManualEditTarget | null | undefined,
): boolean {
  if (!target) return false;
  const authoredDisplay = String(target.styles.display ?? '').trim().toLowerCase();
  if (authoredDisplay && authoredDisplay !== 'inline') return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'svg') return true;
  if (tag === 'a' || tag === 'span' || tag === 'strong' || tag === 'em' || tag === 'b' || tag === 'i' || tag === 'small') {
    return true;
  }
  return target.kind === 'link';
}

/** Resize commit must flush once → one Manual Edit history entry. */
export function resizeHistoryLabel(targetLabel: string): string {
  return `Resize: ${targetLabel}`;
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

/**
 * Staging-compatible session builder (no CB anchor — use startAnchorFromTarget for W/N).
 * Start size is the painted/layout rect, same invariant as `startSizeFromTarget`
 * (do not prefer a smaller authored style px).
 */
export function buildResizeSessionStart(
  targetRect: { x: number; y: number; width: number; height: number },
  _styles: Pick<ManualEditStyles, 'width' | 'height'>,
  handle: ResizeHandle,
  kind: ManualEditKind,
  shiftKey: boolean,
): Omit<ResizeSessionStart, 'anchorPosition' | 'startLeftPx' | 'startTopPx'> & {
  anchorPosition?: boolean;
  startLeftPx?: number | null;
  startTopPx?: number | null;
} {
  const startWidthPx = Math.round(Math.max(1, targetRect.width));
  const startHeightPx = Math.round(Math.max(1, targetRect.height));
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
  target?: ManualEditTarget | null,
): Partial<ManualEditStyles> {
  const { signW, signH } = axisSigns(handle);
  const styles: Partial<ManualEditStyles> = {};
  if ((signW !== 0 || signH !== 0 || result.touchedWidth || result.touchedHeight) && shouldPromoteInlineTargetForResize(target)) {
    styles.display = 'inline-block';
  }
  if (signW !== 0 || result.touchedWidth) {
    styles.width = `${result.widthPx}px`;
    styles.maxWidth = 'none';
  }
  if (signH !== 0 || result.touchedHeight) {
    styles.height = `${result.heightPx}px`;
    styles.maxHeight = 'none';
  }
  return styles;
}
