import {
  MANUAL_EDIT_MOVE_MIN_DELTA_PX,
  canMoveTarget,
  cascadeRollbackStyle,
  computeMove,
  moveResultToStyles,
  promoteViewportDraft,
  startPositionFromTarget,
} from './move-math';
import { diffManualEditStylePatch } from './manual-edit-style-batch';
import type { ManualEditPatch, ManualEditRect, ManualEditStyles, ManualEditTarget } from './types';

export type GroupMoveMemberStart = {
  id: string;
  startLeftPx: number;
  startTopPx: number;
  startRect: ManualEditRect;
};

export type GroupMovePreviewUpdate = {
  id: string;
  styles: Partial<ManualEditStyles>;
  rect: ManualEditRect;
};

/** Group move commit must flush once → one Manual Edit history entry. */
export function groupMoveHistoryLabel(count: number): string {
  return `Move: ${count} elements`;
}

/** Phase 2 — union box drag applies the same Δ only to absolute/fixed targets. */
export function canGroupBoundingMove(
  targets: readonly ManualEditTarget[],
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
): boolean {
  if (targets.length < 2) return false;
  return targets.every((target) => canMoveTarget(target, options));
}

export function buildGroupMoveMemberStarts(
  targets: readonly ManualEditTarget[],
): GroupMoveMemberStart[] {
  return targets.map((target) => {
    const { startLeftPx, startTopPx } = startPositionFromTarget(target);
    return {
      id: target.id,
      startLeftPx,
      startTopPx,
      startRect: { ...target.rect },
    };
  });
}

export function computeGroupMoveMemberStyles(
  member: GroupMoveMemberStart,
  dx: number,
  dy: number,
  shiftKey?: boolean,
): Partial<ManualEditStyles> {
  const result = computeMove({
    startLeftPx: member.startLeftPx,
    startTopPx: member.startTopPx,
    startRect: member.startRect,
    minDeltaPx: 0,
    dx,
    dy,
    shiftKey,
  });
  return moveResultToStyles(result);
}

export function groupMoveDeltaMoved(
  members: readonly GroupMoveMemberStart[],
  dx: number,
  dy: number,
  shiftKey?: boolean,
): boolean {
  if (members.length === 0) return false;
  const probe = computeMove({
    startLeftPx: members[0]!.startLeftPx,
    startTopPx: members[0]!.startTopPx,
    startRect: members[0]!.startRect,
    minDeltaPx: MANUAL_EDIT_MOVE_MIN_DELTA_PX,
    dx,
    dy,
    shiftKey,
  });
  return probe.moved;
}

export function buildGroupMoveStylePatches(
  baseSource: string,
  members: readonly GroupMoveMemberStart[],
  dx: number,
  dy: number,
  shiftKey?: boolean,
): Array<Extract<ManualEditPatch, { kind: 'set-style' }>> {
  const patches: Array<Extract<ManualEditPatch, { kind: 'set-style' }>> = [];
  for (const member of members) {
    const styles = computeGroupMoveMemberStyles(member, dx, dy, shiftKey);
    const effective = diffManualEditStylePatch(baseSource, member.id, styles);
    if (Object.keys(effective).length === 0) continue;
    patches.push({ id: member.id, kind: 'set-style', styles: effective });
  }
  return patches;
}

export function groupMoveStylesBefore(
  targets: readonly ManualEditTarget[],
): Record<string, Partial<ManualEditStyles>> {
  const out: Record<string, Partial<ManualEditStyles>> = {};
  for (const target of targets) {
    out[target.id] = {
      left: cascadeRollbackStyle(target.styles.left),
      top: cascadeRollbackStyle(target.styles.top),
      right: cascadeRollbackStyle(target.styles.right),
      bottom: cascadeRollbackStyle(target.styles.bottom),
    };
  }
  return out;
}

export function computeGroupMovePreviewUpdates(
  members: readonly GroupMoveMemberStart[],
  dx: number,
  dy: number,
  shiftKey?: boolean,
): GroupMovePreviewUpdate[] {
  return members.map((member) => {
    const result = computeMove({
      startLeftPx: member.startLeftPx,
      startTopPx: member.startTopPx,
      startRect: member.startRect,
      minDeltaPx: MANUAL_EDIT_MOVE_MIN_DELTA_PX,
      dx,
      dy,
      shiftKey,
    });
    const viewport = promoteViewportDraft(
      member.startRect,
      member.startLeftPx,
      member.startTopPx,
      result,
    );
    return {
      id: member.id,
      styles: moveResultToStyles(result),
      rect: {
        x: viewport.x,
        y: viewport.y,
        width: member.startRect.width,
        height: member.startRect.height,
      },
    };
  });
}
