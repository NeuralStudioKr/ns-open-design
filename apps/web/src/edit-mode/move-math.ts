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

export function startPositionFromTarget(target: ManualEditTarget): {
  startLeftPx: number;
  startTopPx: number;
} {
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
 */
export function promoteMoveStyles(
  target: ManualEditTarget,
  result: MoveMathResult,
): Partial<ManualEditStyles> {
  const widthPx = Math.round(target.rect.width);
  const heightPx = Math.round(target.rect.height);
  return {
    position: 'absolute',
    left: `${result.leftPx}px`,
    top: `${result.topPx}px`,
    width: `${widthPx}px`,
    height: `${heightPx}px`,
    margin: '0px',
    marginTop: '0px',
    marginRight: '0px',
    marginBottom: '0px',
    marginLeft: '0px',
    right: '',
    bottom: '',
  };
}

/** Styles captured at drag start so promote+move cancel can keyed-rollback. */
export function promoteMoveStylesBefore(target: ManualEditTarget): Partial<ManualEditStyles> {
  return {
    position: '',
    left: target.styles.left,
    top: target.styles.top,
    right: target.styles.right,
    bottom: target.styles.bottom,
    width: target.styles.width,
    height: target.styles.height,
    margin: target.styles.margin,
    marginTop: target.styles.marginTop,
    marginRight: target.styles.marginRight,
    marginBottom: target.styles.marginBottom,
    marginLeft: target.styles.marginLeft,
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
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
] as const satisfies ReadonlyArray<keyof ManualEditStyles>;

/** Move commit must flush once → one Manual Edit history entry. */
export function moveHistoryLabel(targetLabel: string): string {
  return `Move: ${targetLabel}`;
}
