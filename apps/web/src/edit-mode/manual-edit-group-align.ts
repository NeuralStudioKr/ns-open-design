import {
  buildGroupMoveMemberStarts,
  resolveGroupMovableTargets,
  type GroupMovePreviewUpdate,
} from './manual-edit-group-move';
import { diffManualEditStylePatch } from './manual-edit-style-batch';
import { computeMove, moveResultToStyles, promoteViewportDraft } from './move-math';
import { parseManualEditSource, readManualEditStyles } from './source-patches';
import type { ManualEditPatch, ManualEditRect, ManualEditTarget } from './types';

export type GroupAlignKind =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom';

export type GroupDistributeKind = 'horizontal' | 'vertical';

export function groupAlignHistoryLabel(count: number, kind: GroupAlignKind | GroupDistributeKind): string {
  return `Align: ${count} elements (${kind})`;
}

export function canGroupAlign(
  targets: readonly ManualEditTarget[],
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
  isDescendant?: (childId: string, ancestorId: string) => boolean,
): boolean {
  return resolveGroupMovableTargets(targets, options, isDescendant).length >= 2;
}

export function canGroupDistribute(
  targets: readonly ManualEditTarget[],
  options?: { editMode?: boolean; inlineTextEditing?: boolean },
  isDescendant?: (childId: string, ancestorId: string) => boolean,
): boolean {
  return targets.length >= 3
    && resolveGroupMovableTargets(targets, options, isDescendant).length >= 3;
}

function alignDeltaForMember(
  memberRect: ManualEditRect,
  union: ManualEditRect,
  kind: GroupAlignKind,
): { dx: number; dy: number } {
  switch (kind) {
    case 'left':
      return { dx: union.x - memberRect.x, dy: 0 };
    case 'center': {
      const unionCenterX = union.x + union.width / 2;
      const memberCenterX = memberRect.x + memberRect.width / 2;
      return { dx: unionCenterX - memberCenterX, dy: 0 };
    }
    case 'right': {
      const unionRight = union.x + union.width;
      const memberRight = memberRect.x + memberRect.width;
      return { dx: unionRight - memberRight, dy: 0 };
    }
    case 'top':
      return { dx: 0, dy: union.y - memberRect.y };
    case 'middle': {
      const unionCenterY = union.y + union.height / 2;
      const memberCenterY = memberRect.y + memberRect.height / 2;
      return { dx: 0, dy: unionCenterY - memberCenterY };
    }
    case 'bottom': {
      const unionBottom = union.y + union.height;
      const memberBottom = memberRect.y + memberRect.height;
      return { dx: 0, dy: unionBottom - memberBottom };
    }
    default:
      return { dx: 0, dy: 0 };
  }
}

function unionRectFromTargets(targets: readonly ManualEditTarget[]): ManualEditRect {
  let union = { ...targets[0]!.rect };
  for (let i = 1; i < targets.length; i += 1) {
    const rect = targets[i]!.rect;
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

export function computeGroupAlignPreviewUpdates(
  targets: readonly ManualEditTarget[],
  kind: GroupAlignKind,
): GroupMovePreviewUpdate[] {
  const members = buildGroupMoveMemberStarts(targets);
  const union = unionRectFromTargets(targets);
  return members.map((member) => {
    const { dx, dy } = alignDeltaForMember(member.startRect, union, kind);
    const result = computeMove({
      startLeftPx: member.startLeftPx,
      startTopPx: member.startTopPx,
      startRect: member.startRect,
      minDeltaPx: 0,
      dx,
      dy,
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

export function computeGroupDistributePreviewUpdates(
  targets: readonly ManualEditTarget[],
  kind: GroupDistributeKind,
): GroupMovePreviewUpdate[] {
  const members = buildGroupMoveMemberStarts(targets);
  const sorted = [...members].sort((a, b) => (
    kind === 'horizontal'
      ? a.startRect.x - b.startRect.x
      : a.startRect.y - b.startRect.y
  ));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const updates = new Map<string, GroupMovePreviewUpdate>();

  if (kind === 'horizontal') {
    const span = (last.startRect.x + last.startRect.width) - first.startRect.x;
    const totalWidth = sorted.reduce((sum, member) => sum + member.startRect.width, 0);
    const gap = sorted.length > 1 ? (span - totalWidth) / (sorted.length - 1) : 0;
    let cursor = first.startRect.x;
    for (const member of sorted) {
      const dx = cursor - member.startRect.x;
      const result = computeMove({
        startLeftPx: member.startLeftPx,
        startTopPx: member.startTopPx,
        startRect: member.startRect,
        minDeltaPx: 0,
        dx,
        dy: 0,
      });
      const viewport = promoteViewportDraft(
        member.startRect,
        member.startLeftPx,
        member.startTopPx,
        result,
      );
      updates.set(member.id, {
        id: member.id,
        styles: moveResultToStyles(result),
        rect: {
          x: viewport.x,
          y: viewport.y,
          width: member.startRect.width,
          height: member.startRect.height,
        },
      });
      cursor += member.startRect.width + gap;
    }
  } else {
    const span = (last.startRect.y + last.startRect.height) - first.startRect.y;
    const totalHeight = sorted.reduce((sum, member) => sum + member.startRect.height, 0);
    const gap = sorted.length > 1 ? (span - totalHeight) / (sorted.length - 1) : 0;
    let cursor = first.startRect.y;
    for (const member of sorted) {
      const dy = cursor - member.startRect.y;
      const result = computeMove({
        startLeftPx: member.startLeftPx,
        startTopPx: member.startTopPx,
        startRect: member.startRect,
        minDeltaPx: 0,
        dx: 0,
        dy,
      });
      const viewport = promoteViewportDraft(
        member.startRect,
        member.startLeftPx,
        member.startTopPx,
        result,
      );
      updates.set(member.id, {
        id: member.id,
        styles: moveResultToStyles(result),
        rect: {
          x: viewport.x,
          y: viewport.y,
          width: member.startRect.width,
          height: member.startRect.height,
        },
      });
      cursor += member.startRect.height + gap;
    }
  }

  return members.map((member) => updates.get(member.id)!);
}

export function buildGroupGeometryPatches(
  baseSource: string,
  updates: readonly GroupMovePreviewUpdate[],
): {
  patches: Array<Extract<ManualEditPatch, { kind: 'set-style' }>>;
  parsedDoc: Document | null;
} {
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
