import { isAnchoredCssPosition, isDeckSlideRoot, parseExplicitPx } from './resize-math';
import type { ManualEditRect, ManualEditStyles, ManualEditTarget } from './types';

/** Ignore tiny pointer jitter so a plain click does not dirty left/top. */
export const MANUAL_EDIT_MOVE_MIN_DELTA_PX = 2;

export type MoveSessionStart = {
  startLeftPx: number;
  startTopPx: number;
  startRect: ManualEditRect;
  minDeltaPx: number;
};

export type MoveMathResult = {
  leftPx: number;
  topPx: number;
  moved: boolean;
};

export function isInlineSvgTarget(
  target: ManualEditTarget | null | undefined,
): boolean {
  return String(target?.tagName ?? '').toLowerCase() === 'svg';
}

/** Flow img/svg — promote to absolute + size lock (not relative offsets). */
export function isFlowImagePromoteTarget(
  target: ManualEditTarget | null | undefined,
): boolean {
  if (!baseMoveEligibility(target)) return false;
  if (target!.kind !== 'image') return false;
  if (isAnchoredCssPosition(target!.cssPosition)) return false;
  const value = String(target!.cssPosition ?? 'static').toLowerCase();
  return value === 'static' || value === 'relative';
}

/** @deprecated use isFlowImagePromoteTarget */
export const isSvgPromoteTarget = isFlowImagePromoteTarget;

export function canMoveTarget(
  target: ManualEditTarget | null | undefined,
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
): boolean {
  if (!baseMoveEligibility(target, options)) return false;
  return isAnchoredCssPosition(target!.cssPosition);
}

/** Flow boxes that can be offset in-place (no re-parent) then moved — 53. */
export function canPromoteTarget(
  target: ManualEditTarget | null | undefined,
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
): boolean {
  if (!baseMoveEligibility(target, options)) return false;
  if (isAnchoredCssPosition(target!.cssPosition)) return false;
  // Flow images promote to absolute on body-drag (deck icons, hero logos).
  // Absolute/fixed images still move via canMoveTarget. Text/link promote-on-drag
  // is allowed — edge hit-slop + 2px threshold keep wrap-resize from becoming an
  // accidental move; blocking promote made flow headlines undraggable.
  // Sticky left/top are sticky insets, and absolute promotion depends on the
  // scrollport containing block. That coordinate swap is too jump-prone for a
  // drag gesture, so sticky stays non-movable until we have a dedicated path.
  const value = String(target!.cssPosition ?? 'static').toLowerCase();
  return value === 'static' || value === 'relative';
}

/** Sticky cannot use relative left/top (those are sticky insets). */
export function isStickyPromoteTarget(
  target: ManualEditTarget | null | undefined,
): boolean {
  if (!baseMoveEligibility(target)) return false;
  if (isAnchoredCssPosition(target!.cssPosition)) return false;
  return String(target!.cssPosition ?? '').toLowerCase() === 'sticky';
}

export function canMoveOrPromoteTarget(
  target: ManualEditTarget | null | undefined,
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
): boolean {
  return canMoveTarget(target, options) || canPromoteTarget(target, options);
}

function baseMoveEligibility(
  target: ManualEditTarget | null | undefined,
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
): boolean {
  if (!target) return false;
  if (options?.editMode === false) return false;
  if (options?.inlineTextEditing) return false;
  if (target.isHidden) return false;
  if (isDeckSlideRoot(target)) return false;
  if (target.rect.width < 4 || target.rect.height < 4) return false;
  return true;
}

/**
 * Start left/top for a move/promote session.
 * Static/relative flow moves use authored relative `left`/`top` deltas — not
 * layout positions (offsetLeft/rect would double-count flex/grid slots).
 * Sticky uses bridge scrollport content coords (`offset*`) so absolute promote
 * does not jump and further scrolling keeps the box with content.
 */
export function startPositionFromTarget(target: ManualEditTarget): {
  startLeftPx: number;
  startTopPx: number;
} {
  if (isStickyPromoteTarget(target) || isFlowImagePromoteTarget(target)) {
    return {
      startLeftPx: Math.round(
        target.offsetLeft
          ?? parseExplicitPx(target.styles.left)
          ?? target.rect.x,
      ),
      startTopPx: Math.round(
        target.offsetTop
          ?? parseExplicitPx(target.styles.top)
          ?? target.rect.y,
      ),
    };
  }
  if (canPromoteTarget(target)) {
    return {
      startLeftPx: Math.round(parseExplicitPx(target.styles.left) ?? 0),
      startTopPx: Math.round(parseExplicitPx(target.styles.top) ?? 0),
    };
  }
  return {
    startLeftPx: Math.round(
      parseExplicitPx(target.styles.left)
        ?? target.offsetLeft
        ?? target.rect.x,
    ),
    startTopPx: Math.round(
      parseExplicitPx(target.styles.top)
        ?? target.offsetTop
        ?? target.rect.y,
    ),
  };
}

/**
 * Translate left/top by content-space deltas.
 * With Shift held, lock to the dominant axis (horizontal if |dx| >= |dy|).
 */
export function computeMove(
  input: MoveSessionStart & { dx: number; dy: number; shiftKey?: boolean },
): MoveMathResult {
  let dx = input.dx;
  let dy = input.dy;
  if (input.shiftKey) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  const leftPx = Math.round(input.startLeftPx + dx);
  const topPx = Math.round(input.startTopPx + dy);
  const moved =
    Math.hypot(leftPx - input.startLeftPx, topPx - input.startTopPx) >= input.minDeltaPx;
  return { leftPx, topPx, moved };
}

/**
 * Persist left/top and clear right/bottom so opposing edges cannot pin the box
 * after a body-drag move (52 Phase 2).
 */
export function moveResultToStyles(result: MoveMathResult): Partial<ManualEditStyles> {
  if (!result.moved) return {};
  return {
    left: `${result.leftPx}px`,
    top: `${result.topPx}px`,
    right: '',
    bottom: '',
  };
}

/** Live preview styles (also clear opposing edges once the pointer moves). */
export function movePreviewStyles(result: MoveMathResult): Partial<ManualEditStyles> {
  return {
    left: `${result.leftPx}px`,
    top: `${result.topPx}px`,
    right: '',
    bottom: '',
  };
}

/**
 * In-place flow offset + move styles (53).
 * - static/relative: `position:relative` offsets — keeps layout slot so grouped
 *   cards/flex items do not cause sibling reflow.
 * - sticky: `position:absolute` + size lock against the scrollport CB (relative
 *   left/top would collide with sticky insets).
 */
export function promoteMoveStyles(
  startRect: ManualEditRect,
  result: MoveMathResult,
  options?: {
    layoutWidthPx?: number;
    layoutHeightPx?: number;
    cssPosition?: string;
    svgPromote?: boolean;
    imagePromote?: boolean;
  },
): Partial<ManualEditStyles> {
  const stickyPromote = String(options?.cssPosition ?? '').toLowerCase() === 'sticky';
  const absolutePromote = stickyPromote || options?.imagePromote === true || options?.svgPromote === true;
  if (absolutePromote) {
    const widthPx = Math.round(
      options?.layoutWidthPx && options.layoutWidthPx >= 1
        ? options.layoutWidthPx
        : startRect.width,
    );
    const heightPx = Math.round(
      options?.layoutHeightPx && options.layoutHeightPx >= 1
        ? options.layoutHeightPx
        : startRect.height,
    );
    return {
      position: 'absolute',
      left: `${result.leftPx}px`,
      top: `${result.topPx}px`,
      width: `${widthPx}px`,
      height: `${heightPx}px`,
      maxWidth: 'none',
      maxHeight: 'none',
      margin: '0px',
      marginTop: '0px',
      marginRight: '0px',
      marginBottom: '0px',
      marginLeft: '0px',
      right: '',
      bottom: '',
    };
  }
  return {
    position: 'relative',
    left: `${result.leftPx}px`,
    top: `${result.topPx}px`,
    right: '',
    bottom: '',
  };
}

/**
 * Collapse computed-only cascade keywords so cancel `removeProperty`s them
 * instead of baking `auto`/`static` into the live preview.
 */
export function cascadeRollbackStyle(value: string | undefined): string {
  const v = String(value ?? '').trim();
  const lower = v.toLowerCase();
  if (!v || lower === 'auto' || lower === 'normal' || lower === 'static') return '';
  return v;
}

/** Styles captured at drag start so promote+move cancel can keyed-rollback. */
export function promoteMoveStylesBefore(target: ManualEditTarget): Partial<ManualEditStyles> {
  return {
    position: cascadeRollbackStyle(target.styles.position),
    left: cascadeRollbackStyle(target.styles.left),
    top: cascadeRollbackStyle(target.styles.top),
    right: cascadeRollbackStyle(target.styles.right),
    bottom: cascadeRollbackStyle(target.styles.bottom),
    // Size/margin: keep rollback coverage for older previews that may already
    // have injected locks before the relative-offset move policy.
    width: cascadeRollbackStyle(target.styles.width),
    height: cascadeRollbackStyle(target.styles.height),
    maxWidth: cascadeRollbackStyle(target.styles.maxWidth),
    maxHeight: cascadeRollbackStyle(target.styles.maxHeight),
    margin: cascadeRollbackStyle(target.styles.margin),
    marginTop: cascadeRollbackStyle(target.styles.marginTop),
    marginRight: cascadeRollbackStyle(target.styles.marginRight),
    marginBottom: cascadeRollbackStyle(target.styles.marginBottom),
    marginLeft: cascadeRollbackStyle(target.styles.marginLeft),
  };
}

export const PROMOTE_MOVE_STYLE_KEYS = [
  'position',
  'left',
  'top',
  'right',
  'bottom',
  'width',
  'height',
  'maxWidth',
  'maxHeight',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
] as const satisfies ReadonlyArray<keyof ManualEditStyles>;

/**
 * Host overlay viewport origin while body-dragging.
 * CSS `left`/`top` are containing-block relative for absolute/fixed (and for
 * in-flight promote) — never feed them straight into the overlay/rect.
 */
export function promoteViewportDraft(
  startRect: ManualEditRect,
  startLeftPx: number,
  startTopPx: number,
  result: MoveMathResult,
): { x: number; y: number } {
  return {
    x: startRect.x + (result.leftPx - startLeftPx),
    y: startRect.y + (result.topPx - startTopPx),
  };
}

/**
 * After move/promote persist, keep viewport `x`/`y` until remasure.
 * CSS `left`/`top` are containing-block relative and must not become rect origin.
 */
export function viewportRectAfterMoveCommit(
  currentRect: ManualEditRect,
  nextWidth: number,
  nextHeight: number,
): ManualEditRect {
  return {
    ...currentRect,
    width: nextWidth,
    height: nextHeight,
  };
}

/**
 * Convert a mid-gesture `promoteViewportDraft` origin into visual content coords
 * for idle overlay compose.
 *
 * During drag, viewport = visualStart + **layout** Δ (host Δ / paint÷layout).
 * Painting that hybrid with iframe `previewScale` (often ~1) jumps the box under
 * deck fit-scale. Scale the layout Δ by visual/layout before writing `target.rect`.
 */
export function visualRectFromMoveViewportDraft(
  startVisualRect: ManualEditRect,
  viewport: { x: number; y: number },
  layoutWidth: number,
  layoutHeight: number,
  nextVisualWidth: number,
  nextVisualHeight: number,
): ManualEditRect {
  const ratioX = layoutWidth > 0 ? startVisualRect.width / layoutWidth : 1;
  const ratioY = layoutHeight > 0 ? startVisualRect.height / layoutHeight : 1;
  const layoutDx = viewport.x - startVisualRect.x;
  const layoutDy = viewport.y - startVisualRect.y;
  return {
    x: Math.round(startVisualRect.x + layoutDx * ratioX),
    y: Math.round(startVisualRect.y + layoutDy * ratioY),
    width: nextVisualWidth,
    height: nextVisualHeight,
  };
}

/** Host-space paint box matching a visual content rect (post-commit seed). */
export function hostPaintRectFromVisualContent(
  visualRect: ManualEditRect,
  hostScale: number,
  hostOffset: { x: number; y: number },
): ManualEditRect {
  const scale = Number.isFinite(hostScale) && hostScale > 0 ? hostScale : 1;
  return {
    x: hostOffset.x + visualRect.x * scale,
    y: hostOffset.y + visualRect.y * scale,
    width: visualRect.width * scale,
    height: visualRect.height * scale,
  };
}

/**
 * Translate a frozen start `hostPaintRect` by the visual content delta.
 * Preserves letterbox/iframe offsets that `hostPaintRectFromVisualContent`
 * can miss when React hostScale/offset lag the painted frame.
 */
export function hostPaintRectAfterVisualMove(
  previousPaint: ManualEditRect,
  previousVisual: ManualEditRect,
  nextVisual: ManualEditRect,
): ManualEditRect | null {
  if (
    previousPaint.width < 1
    || previousPaint.height < 1
    || previousVisual.width < 1
    || previousVisual.height < 1
  ) {
    return null;
  }
  const sx = previousPaint.width / previousVisual.width;
  const sy = previousPaint.height / previousVisual.height;
  return {
    x: previousPaint.x + (nextVisual.x - previousVisual.x) * sx,
    y: previousPaint.y + (nextVisual.y - previousVisual.y) * sy,
    width: nextVisual.width * sx,
    height: nextVisual.height * sy,
  };
}

/** Move commit must flush once → one Manual Edit history entry. */
export function moveHistoryLabel(targetLabel: string): string {
  return `Move: ${targetLabel}`;
}

const GEOMETRY_MATCH_TOLERANCE_PX = 3;
/** Idle od-edit-rect jumps beyond this floor are treated as bad remasures (not layout). */
export const MANUAL_EDIT_IDLE_REMEASURE_WILD_JUMP_PX = 480;
/** Large targets may move farther in one layout pass — scale threshold by box span. */
export const MANUAL_EDIT_IDLE_REMEASURE_WILD_JUMP_SPAN_FACTOR = 1.5;

/**
 * Content-space wild-jump threshold: max(base floor, 1.5× larger side of `reference`).
 * Keeps small elements strict while large slides tolerate bigger reflows.
 *
 * Do NOT multiply by host `previewScale`. `od-edit-rect` / target.rect are
 * content-space; host chrome scaling belongs in `resolveManualEditChromeHostRect`.
 * Scaling the threshold by previewScale would under-deny when scale < 1 and
 * over-deny when scale > 1 while deltas stay in content px.
 */
export function manualEditIdleRemeasureWildJumpThresholdPx(
  reference: Pick<ManualEditTarget, 'rect'>,
  basePx = MANUAL_EDIT_IDLE_REMEASURE_WILD_JUMP_PX,
  spanFactor = MANUAL_EDIT_IDLE_REMEASURE_WILD_JUMP_SPAN_FACTOR,
): number {
  const span = Math.max(reference.rect.width, reference.rect.height, 1);
  const scaled = span * (Number.isFinite(spanFactor) && spanFactor > 0 ? spanFactor : 1.5);
  const floor = Number.isFinite(basePx) && basePx > 0 ? basePx : MANUAL_EDIT_IDLE_REMEASURE_WILD_JUMP_PX;
  return Math.max(floor, scaled);
}

/** Whether two manual-edit geometry snapshots are close enough to treat as the same box. */
export function manualEditGeometryRoughlyMatches(
  a: Pick<ManualEditTarget, 'rect' | 'layoutWidth' | 'layoutHeight'>,
  b: Pick<ManualEditTarget, 'rect' | 'layoutWidth' | 'layoutHeight'>,
  tolerancePx = GEOMETRY_MATCH_TOLERANCE_PX,
): boolean {
  const aLw = a.layoutWidth && a.layoutWidth >= 1 ? a.layoutWidth : a.rect.width;
  const aLh = a.layoutHeight && a.layoutHeight >= 1 ? a.layoutHeight : a.rect.height;
  const bLw = b.layoutWidth && b.layoutWidth >= 1 ? b.layoutWidth : b.rect.width;
  const bLh = b.layoutHeight && b.layoutHeight >= 1 ? b.layoutHeight : b.rect.height;
  return (
    Math.abs(a.rect.x - b.rect.x) <= tolerancePx
    && Math.abs(a.rect.y - b.rect.y) <= tolerancePx
    && Math.abs(a.rect.width - b.rect.width) <= tolerancePx
    && Math.abs(a.rect.height - b.rect.height) <= tolerancePx
    && Math.abs(aLw - bLw) <= tolerancePx
    && Math.abs(aLh - bLh) <= tolerancePx
  );
}

/**
 * Idle remasure wild-jump — center or size delta far beyond normal layout churn.
 * Gesture/handoff paths own large intentional moves; idle rect must not teleport.
 * Default threshold scales with the prior box span (see threshold helper).
 */
export function manualEditGeometryIsWildJump(
  a: Pick<ManualEditTarget, 'rect'>,
  b: Pick<ManualEditTarget, 'rect'>,
  thresholdPx: number = manualEditIdleRemeasureWildJumpThresholdPx(a),
): boolean {
  const aCx = a.rect.x + a.rect.width / 2;
  const aCy = a.rect.y + a.rect.height / 2;
  const bCx = b.rect.x + b.rect.width / 2;
  const bCy = b.rect.y + b.rect.height / 2;
  return (
    Math.abs(aCx - bCx) > thresholdPx
    || Math.abs(aCy - bCy) > thresholdPx
    || Math.abs(a.rect.width - b.rect.width) > thresholdPx
    || Math.abs(a.rect.height - b.rect.height) > thresholdPx
  );
}

/** True when idle host paint disagrees with target.rect compose (stale paint). */
export function manualEditHostPaintRectStale(
  hostPaintRect: ManualEditRect,
  composedHostRect: ManualEditRect,
  tolerancePx = GEOMETRY_MATCH_TOLERANCE_PX,
): boolean {
  const sizeMatches = (
    Math.abs(hostPaintRect.width - composedHostRect.width) <= tolerancePx
    && Math.abs(hostPaintRect.height - composedHostRect.height) <= tolerancePx
  );
  const positionMatches = (
    Math.abs(hostPaintRect.x - composedHostRect.x) <= tolerancePx
    && Math.abs(hostPaintRect.y - composedHostRect.y) <= tolerancePx
  );
  if (sizeMatches && positionMatches) return false;
  const sizeDiffers = !sizeMatches;
  const paintFitsWithinComposed = (
    hostPaintRect.width <= composedHostRect.width + tolerancePx
    && hostPaintRect.height <= composedHostRect.height + tolerancePx
  );
  // Letterboxed live paint shifts x/y while painting the same content at a
  // smaller host scale — trust it. If stale paint is larger than the composed
  // optimistic rect after resize, it leaves the selection box bigger than the
  // actual element, so treat it as stale.
  if (sizeDiffers && !positionMatches) return !paintFitsWithinComposed;
  // Same origin, pre-gesture size (resize snap-back).
  if (sizeDiffers && positionMatches) return true;
  // Same size, pre-gesture position (move snap-back).
  return !positionMatches;
}

/** Host rect for selection chrome / panel — skip stale paint, prefer composed. */
export function resolveManualEditChromeHostRect(
  targetRect: ManualEditRect,
  previewScale: number,
  hostOffset: { x: number; y: number },
  hostPaintRect: ManualEditRect | null,
  trustHostPaintDespiteStale = false,
): ManualEditRect {
  const scaled = {
    x: targetRect.x * previewScale,
    y: targetRect.y * previewScale,
    width: targetRect.width * previewScale,
    height: targetRect.height * previewScale,
  };
  const composedHostRect = {
    x: hostOffset.x + scaled.x,
    y: hostOffset.y + scaled.y,
    width: scaled.width,
    height: scaled.height,
  };
  if (
    hostPaintRect
    && hostPaintRect.width >= 1
    && hostPaintRect.height >= 1
    && (
      trustHostPaintDespiteStale
      || !manualEditHostPaintRectStale(hostPaintRect, composedHostRect)
    )
  ) {
    return hostPaintRect;
  }
  return composedHostRect;
}
