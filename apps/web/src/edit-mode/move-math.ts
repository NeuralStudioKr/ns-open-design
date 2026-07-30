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
  if (!target) return false;
  if (options?.editMode === false) return false;
  if (options?.inlineTextEditing) return false;
  if (target.isHidden) return false;
  if (isDeckSlideRoot(target)) return false;
  if (!isAnchoredCssPosition(target.cssPosition)) return false;
  if (target.rect.width < 4 || target.rect.height < 4) return false;
  return true;
}

export function startPositionFromTarget(target: ManualEditTarget): {
  startLeftPx: number;
  startTopPx: number;
} {
  return {
    startLeftPx: Math.round(parseExplicitPx(target.styles.left) ?? target.rect.x),
    startTopPx: Math.round(parseExplicitPx(target.styles.top) ?? target.rect.y),
  };
}

export function computeMove(input: MoveSessionStart & { dx: number; dy: number }): MoveMathResult {
  const leftPx = Math.round(input.startLeftPx + input.dx);
  const topPx = Math.round(input.startTopPx + input.dy);
  const moved =
    Math.hypot(leftPx - input.startLeftPx, topPx - input.startTopPx) >= input.minDeltaPx;
  return { leftPx, topPx, moved };
}

export function moveResultToStyles(result: MoveMathResult): Partial<ManualEditStyles> {
  if (!result.moved) return {};
  return {
    left: `${result.leftPx}px`,
    top: `${result.topPx}px`,
  };
}

/** Move commit must flush once → one Manual Edit history entry. */
export function moveHistoryLabel(targetLabel: string): string {
  return `Move: ${targetLabel}`;
}
