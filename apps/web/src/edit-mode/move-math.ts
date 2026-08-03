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

export function canMoveTarget(
  target: ManualEditTarget | null | undefined,
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
): boolean {
  if (!baseMoveEligibility(target, options)) return false;
  return isAnchoredCssPosition(target!.cssPosition);
}

/** Flow boxes that can be freed in-place (no re-parent) then moved — 53. */
export function canPromoteTarget(
  target: ManualEditTarget | null | undefined,
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
): boolean {
  if (!baseMoveEligibility(target, options)) return false;
  if (isAnchoredCssPosition(target!.cssPosition)) return false;
  // Flow text/link boxes are primarily resized for wrapping. Promoting them to
  // absolute on body-drag makes a missed resize handle look like an unwanted
  // move. Already-positioned text still moves through canMoveTarget above.
  if (target!.kind === 'text' || target!.kind === 'link') return false;
  // Images/SVGs stay in flow for resize-in-place; body drag must not promote→move.
  // Absolute/fixed images still move via canMoveTarget.
  if (target!.kind === 'image') return false;
  const value = String(target!.cssPosition ?? 'static').toLowerCase();
  return value === 'static' || value === 'relative' || value === 'sticky';
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
 * Promote (flow) must prefer offsetParent / post-absolute CB coords — relative
 * `left`/`top` styles are deltas, not layout position (53 no-jump).
 */
export function startPositionFromTarget(target: ManualEditTarget): {
  startLeftPx: number;
  startTopPx: number;
} {
  if (canPromoteTarget(target)) {
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
 * In-place absolute promote + move styles (53). Keeps DOM parent; locks box size
 * and zeroes margin so flow exit does not collapse or double-offset.
 *
 * Size lock must be layout px (`offsetWidth`), not visual `startRect` — under
 * deck-stage transform, writing gBCR width as CSS collapses the box on promote.
 */
export function promoteMoveStyles(
  startRect: ManualEditRect,
  result: MoveMathResult,
  options?: { layoutWidthPx?: number; layoutHeightPx?: number },
): Partial<ManualEditStyles> {
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
    // Size/margin: prefer restoring prior non-keyword values; empty clears
    // promote-injected locks when the source had no real inline size.
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

/** Move commit must flush once → one Manual Edit history entry. */
export function moveHistoryLabel(targetLabel: string): string {
  return `Move: ${targetLabel}`;
}
