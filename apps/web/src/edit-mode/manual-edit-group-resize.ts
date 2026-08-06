import { filterRootTargetsForGroupGeometry } from './manual-edit-selection-ancestry';
import { canMoveTarget, cascadeRollbackStyle, startPositionFromTarget } from './move-math';
import { diffManualEditStylePatch } from './manual-edit-style-batch';
import { parseManualEditSource, readManualEditStyles } from './source-patches';
import {
  MANUAL_EDIT_RESIZE_MIN_DELTA_PX,
  MANUAL_EDIT_RESIZE_MIN_PX,
  canResizeTarget,
  computeResize,
  startSizeFromTarget,
  type ResizeHandle,
} from './resize-math';
import type { ManualEditPatch, ManualEditRect, ManualEditStyles, ManualEditTarget } from './types';

export type GroupResizeMemberStart = {
  id: string;
  startRect: ManualEditRect;
  startLeftPx: number;
  startTopPx: number;
  startWidthPx: number;
  startHeightPx: number;
};

export type GroupResizePreviewUpdate = {
  id: string;
  styles: Partial<ManualEditStyles>;
  rect: ManualEditRect;
};

/** Group resize commit must flush once → one Manual Edit history entry. */
export function groupResizeHistoryLabel(count: number): string {
  return `Resize: ${count} elements`;
}

/** Phase 3 — union resize scales absolute/fixed boxes from a shared anchor. */
export function canGroupBoundingResize(
  targets: readonly ManualEditTarget[],
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
  isDescendant?: (childId: string, ancestorId: string) => boolean,
): boolean {
  const roots = resolveGroupResizableTargets(targets, options, isDescendant);
  return roots.length >= 2;
}

export function resolveGroupResizableTargets(
  targets: readonly ManualEditTarget[],
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
  isDescendant?: (childId: string, ancestorId: string) => boolean,
): ManualEditTarget[] {
  const resizable = targets.filter(
    (target) => canMoveTarget(target, options) && canResizeTarget(target, options),
  );
  if (!isDescendant || resizable.length < 2) return resizable;
  return filterRootTargetsForGroupGeometry(resizable, isDescendant);
}

export function buildGroupResizeMemberStarts(
  targets: readonly ManualEditTarget[],
): GroupResizeMemberStart[] {
  return targets.map((target) => {
    const { startLeftPx, startTopPx } = startPositionFromTarget(target);
    const { widthPx, heightPx } = startSizeFromTarget(target);
    return {
      id: target.id,
      startRect: { ...target.rect },
      startLeftPx,
      startTopPx,
      startWidthPx: widthPx,
      startHeightPx: heightPx,
    };
  });
}

export function unionRectFromMemberStarts(
  members: readonly GroupResizeMemberStart[],
): ManualEditRect | null {
  if (members.length === 0) return null;
  let union = { ...members[0]!.startRect };
  for (let i = 1; i < members.length; i += 1) {
    const rect = members[i]!.startRect;
    const right = Math.max(union.x + union.width, rect.x + rect.width);
    const bottom = Math.max(union.y + union.height, rect.y + rect.height);
    union = {
      x: Math.min(union.x, rect.x),
      y: Math.min(union.y, rect.y),
      width: right - Math.min(union.x, rect.x),
      height: bottom - Math.min(union.y, rect.y),
    };
  }
  return union;
}

export function groupResizeDeltaMoved(
  unionStart: ManualEditRect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  shiftKey?: boolean,
): boolean {
  const result = computeResize({
    startRect: unionStart,
    startWidthPx: unionStart.width,
    startHeightPx: unionStart.height,
    aspect: unionStart.width / Math.max(1, unionStart.height),
    handle,
    aspectLock: shiftKey === true,
    minWidth: MANUAL_EDIT_RESIZE_MIN_PX,
    minHeight: MANUAL_EDIT_RESIZE_MIN_PX,
    dx,
    dy,
    anchorPosition: true,
    startLeftPx: Math.round(unionStart.x),
    startTopPx: Math.round(unionStart.y),
  });
  return (
    Math.abs(result.widthPx - unionStart.width) >= MANUAL_EDIT_RESIZE_MIN_DELTA_PX
    || Math.abs(result.heightPx - unionStart.height) >= MANUAL_EDIT_RESIZE_MIN_DELTA_PX
    || Math.abs(result.x - unionStart.x) >= MANUAL_EDIT_RESIZE_MIN_DELTA_PX
    || Math.abs(result.y - unionStart.y) >= MANUAL_EDIT_RESIZE_MIN_DELTA_PX
  );
}

export function computeGroupResizePreviewUpdates(
  unionStart: ManualEditRect,
  members: readonly GroupResizeMemberStart[],
  handle: ResizeHandle,
  dx: number,
  dy: number,
  shiftKey?: boolean,
): GroupResizePreviewUpdate[] {
  const unionResult = computeResize({
    startRect: unionStart,
    startWidthPx: unionStart.width,
    startHeightPx: unionStart.height,
    aspect: unionStart.width / Math.max(1, unionStart.height),
    handle,
    aspectLock: shiftKey === true,
    minWidth: MANUAL_EDIT_RESIZE_MIN_PX,
    minHeight: MANUAL_EDIT_RESIZE_MIN_PX,
    dx,
    dy,
    anchorPosition: true,
    startLeftPx: Math.round(unionStart.x),
    startTopPx: Math.round(unionStart.y),
  });
  const scaleX = unionResult.widthPx / Math.max(1, unionStart.width);
  const scaleY = unionResult.heightPx / Math.max(1, unionStart.height);
  return members.map((member) => {
    const relX = member.startRect.x - unionStart.x;
    const relY = member.startRect.y - unionStart.y;
    const newX = unionResult.x + relX * scaleX;
    const newY = unionResult.y + relY * scaleY;
    const newWidth = Math.max(MANUAL_EDIT_RESIZE_MIN_PX, member.startWidthPx * scaleX);
    const newHeight = Math.max(MANUAL_EDIT_RESIZE_MIN_PX, member.startHeightPx * scaleY);
    const dxPos = newX - member.startRect.x;
    const dyPos = newY - member.startRect.y;
    return {
      id: member.id,
      styles: {
        left: `${Math.round(member.startLeftPx + dxPos)}px`,
        top: `${Math.round(member.startTopPx + dyPos)}px`,
        width: `${Math.round(newWidth)}px`,
        height: `${Math.round(newHeight)}px`,
        right: '',
        bottom: '',
        maxWidth: 'none',
        maxHeight: 'none',
      },
      rect: {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
      },
    };
  });
}

export function groupResizeStylesBefore(
  targets: readonly ManualEditTarget[],
): Record<string, Partial<ManualEditStyles>> {
  const out: Record<string, Partial<ManualEditStyles>> = {};
  for (const target of targets) {
    out[target.id] = {
      left: cascadeRollbackStyle(target.styles.left),
      top: cascadeRollbackStyle(target.styles.top),
      right: cascadeRollbackStyle(target.styles.right),
      bottom: cascadeRollbackStyle(target.styles.bottom),
      width: cascadeRollbackStyle(target.styles.width),
      height: cascadeRollbackStyle(target.styles.height),
      maxWidth: cascadeRollbackStyle(target.styles.maxWidth),
      maxHeight: cascadeRollbackStyle(target.styles.maxHeight),
    };
  }
  return out;
}

export function buildGroupResizeStylePatches(
  baseSource: string,
  members: readonly GroupResizeMemberStart[],
  handle: ResizeHandle,
  dx: number,
  dy: number,
  shiftKey?: boolean,
): {
  patches: Array<Extract<ManualEditPatch, { kind: 'set-style' }>>;
  parsedDoc: Document | null;
} {
  const unionStart = unionRectFromMemberStarts(members);
  if (!unionStart) return { patches: [], parsedDoc: null };
  const updates = computeGroupResizePreviewUpdates(
    unionStart,
    members,
    handle,
    dx,
    dy,
    shiftKey,
  );
  // One Document for all member diffs (was N× readManualEditStyles).
  const parsedDoc = parseManualEditSource(baseSource);
  const patches: Array<Extract<ManualEditPatch, { kind: 'set-style' }>> = [];
  for (const update of updates) {
    const sourceStyles = readManualEditStyles(baseSource, update.id, {}, parsedDoc);
    const effective = diffManualEditStylePatch(baseSource, update.id, update.styles, {
      sourceStyles,
    });
    if (Object.keys(effective).length === 0) continue;
    patches.push({ id: update.id, kind: 'set-style', styles: effective });
  }
  return { patches, parsedDoc };
}
