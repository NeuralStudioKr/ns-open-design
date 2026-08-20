import { filterRootTargetsForGroupGeometry } from './manual-edit-selection-ancestry';
import {
  MANUAL_EDIT_MOVE_MIN_DELTA_PX,
  canMoveOrPromoteTarget,
  canMoveTarget,
  canPromoteTarget,
  cascadeRollbackStyle,
  computeMove,
  isFlowImagePromoteTarget,
  moveResultToStyles,
  promoteMoveStyles,
  promoteMoveStylesBefore,
  promoteViewportDraft,
  startPositionFromTarget,
} from './move-math';
import { diffManualEditStylePatch } from './manual-edit-style-batch';
import { parseManualEditSource, readManualEditStyles } from './source-patches';
import type { ManualEditPatch, ManualEditRect, ManualEditStyles, ManualEditTarget } from './types';

export type GroupMoveMemberStart = {
  id: string;
  startLeftPx: number;
  startTopPx: number;
  startRect: ManualEditRect;
  layoutWidthPx: number;
  layoutHeightPx: number;
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

/** Phase 2 — union box drag applies the same Δ to every movable/promotable root. */
export function canGroupBoundingMove(
  targets: readonly ManualEditTarget[],
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
  isDescendant?: (childId: string, ancestorId: string) => boolean,
): boolean {
  const roots = resolveGroupMoveTargets(targets, options, isDescendant);
  return roots.length >= 2;
}

/** Anchored-only roots — align/distribute still require absolute/fixed boxes. */
export function resolveGroupMovableTargets(
  targets: readonly ManualEditTarget[],
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
  isDescendant?: (childId: string, ancestorId: string) => boolean,
): ManualEditTarget[] {
  const movable = targets.filter((target) => canMoveTarget(target, options));
  if (!isDescendant || movable.length < 2) return movable;
  return filterRootTargetsForGroupGeometry(movable, isDescendant);
}

/** Union drag roots — absolute/fixed + flow promote (text, img, svg). */
export function resolveGroupMoveTargets(
  targets: readonly ManualEditTarget[],
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
  isDescendant?: (childId: string, ancestorId: string) => boolean,
): ManualEditTarget[] {
  const movable = targets.filter((target) => canMoveOrPromoteTarget(target, options));
  if (!isDescendant || movable.length < 2) return movable;
  return filterRootTargetsForGroupGeometry(movable, isDescendant);
}

function layoutSizeFromTarget(target: ManualEditTarget): { widthPx: number; heightPx: number } {
  const widthPx = Math.round(Math.max(
    1,
    target.layoutWidth && target.layoutWidth >= 1 ? target.layoutWidth : target.rect.width,
  ));
  const heightPx = Math.round(Math.max(
    1,
    target.layoutHeight && target.layoutHeight >= 1 ? target.layoutHeight : target.rect.height,
  ));
  return { widthPx, heightPx };
}

export function buildGroupMoveMemberStarts(
  targets: readonly ManualEditTarget[],
): GroupMoveMemberStart[] {
  return targets.map((target) => {
    const { startLeftPx, startTopPx } = startPositionFromTarget(target);
    const size = layoutSizeFromTarget(target);
    return {
      id: target.id,
      startLeftPx,
      startTopPx,
      startRect: { ...target.rect },
      layoutWidthPx: size.widthPx,
      layoutHeightPx: size.heightPx,
    };
  });
}

export function computeGroupMoveMemberStyles(
  member: GroupMoveMemberStart,
  target: ManualEditTarget,
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
  if (isFlowImagePromoteTarget(target)) {
    return promoteMoveStyles(member.startRect, result, {
      layoutWidthPx: member.layoutWidthPx,
      layoutHeightPx: member.layoutHeightPx,
      imagePromote: true,
    });
  }
  if (canPromoteTarget(target)) {
    return promoteMoveStyles(member.startRect, result, {
      layoutWidthPx: member.layoutWidthPx,
      layoutHeightPx: member.layoutHeightPx,
      cssPosition: target.cssPosition,
    });
  }
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

export type GroupStylePatchesResult = {
  patches: Array<Extract<ManualEditPatch, { kind: 'set-style' }>>;
  /** Shared Document from style diffs — forward into applyManualEditBatch. */
  parsedDoc: Document | null;
};

export function buildGroupMoveStylePatches(
  baseSource: string,
  members: readonly GroupMoveMemberStart[],
  targetsById: ReadonlyMap<string, ManualEditTarget>,
  dx: number,
  dy: number,
  shiftKey?: boolean,
): GroupStylePatchesResult {
  // One Document for all member diffs (was N× readManualEditStyles).
  const parsedDoc = parseManualEditSource(baseSource);
  const patches: Array<Extract<ManualEditPatch, { kind: 'set-style' }>> = [];
  for (const member of members) {
    const target = targetsById.get(member.id);
    if (!target) continue;
    const styles = computeGroupMoveMemberStyles(member, target, dx, dy, shiftKey);
    const sourceStyles = readManualEditStyles(baseSource, member.id, {}, parsedDoc);
    const effective = diffManualEditStylePatch(baseSource, member.id, styles, { sourceStyles });
    if (Object.keys(effective).length === 0) continue;
    patches.push({ id: member.id, kind: 'set-style', styles: effective });
  }
  return { patches, parsedDoc };
}

export function groupMoveStylesBefore(
  targets: readonly ManualEditTarget[],
): Record<string, Partial<ManualEditStyles>> {
  const out: Record<string, Partial<ManualEditStyles>> = {};
  for (const target of targets) {
    if (canPromoteTarget(target) || isFlowImagePromoteTarget(target)) {
      out[target.id] = promoteMoveStylesBefore(target);
      continue;
    }
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
  targetsById: ReadonlyMap<string, ManualEditTarget>,
  dx: number,
  dy: number,
  shiftKey?: boolean,
): GroupMovePreviewUpdate[] {
  return members.map((member) => {
    const target = targetsById.get(member.id);
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
    const styles = target
      ? computeGroupMoveMemberStyles(member, target, dx, dy, shiftKey)
      : moveResultToStyles(result);
    return {
      id: member.id,
      styles,
      rect: {
        x: viewport.x,
        y: viewport.y,
        width: member.startRect.width,
        height: member.startRect.height,
      },
    };
  });
}
