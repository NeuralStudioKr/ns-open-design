import { buildZOrderStylePatch, canAdjustZOrderTarget } from './manual-edit-z-order';
import { sortManualEditLayerTargetsByPaintOrder } from './manual-edit-layer-targets';
import type { ManualEditStyles, ManualEditTarget } from './types';

export type LayerReorderSibling = Pick<
  ManualEditTarget,
  'id' | 'cssPosition' | 'parentKey' | 'styles' | 'stackZ' | 'isHidden' | 'slideIndex'
>;

export function resolveLayerReorderSiblings(
  targets: readonly ManualEditTarget[],
  draggedId: string,
  options?: { activeSlideIndex?: number | null; deck?: boolean },
): ManualEditTarget[] {
  const dragged = targets.find((target) => target.id === draggedId);
  if (!dragged?.parentKey || !canAdjustZOrderTarget(dragged.cssPosition)) return [];
  return targets.filter((target) => {
    if (target.isHidden) return false;
    if (!canAdjustZOrderTarget(target.cssPosition)) return false;
    if (target.parentKey !== dragged.parentKey) return false;
    if (options?.deck && typeof options.activeSlideIndex === 'number') {
      return target.slideIndex === undefined || target.slideIndex === options.activeSlideIndex;
    }
    return true;
  });
}

/** Includes hidden siblings so z-index renumbering preserves true paint order. */
export function resolveLayerReorderStackSiblings(
  targets: readonly ManualEditTarget[],
  draggedId: string,
  options?: { activeSlideIndex?: number | null; deck?: boolean },
): ManualEditTarget[] {
  const dragged = targets.find((target) => target.id === draggedId);
  if (!dragged?.parentKey || !canAdjustZOrderTarget(dragged.cssPosition)) return [];
  return targets.filter((target) => {
    if (!canAdjustZOrderTarget(target.cssPosition)) return false;
    if (target.parentKey !== dragged.parentKey) return false;
    if (options?.deck && typeof options.activeSlideIndex === 'number') {
      return target.slideIndex === undefined || target.slideIndex === options.activeSlideIndex;
    }
    return true;
  });
}

export function mergeVisibleLayerReorderIntoStack(
  stackSiblings: readonly ManualEditTarget[],
  visibleFrontFirst: readonly string[],
  visibleNextOrder: readonly string[],
): string[] {
  const visibleSet = new Set(visibleFrontFirst);
  const stackFrontFirst = layerReorderGroupFrontFirstIds(stackSiblings);
  const visibleQueue = [...visibleNextOrder];
  return stackFrontFirst.map((id) => {
    if (!visibleSet.has(id)) return id;
    return visibleQueue.shift() ?? id;
  });
}

export function layerReorderGroupFrontFirstIds(siblings: readonly ManualEditTarget[]): string[] {
  return sortManualEditLayerTargetsByPaintOrder(siblings).map((target) => target.id);
}

/** Front-most first. `insertIndex` is the index in the list after removing `draggedId`. */
export function reorderLayerPaintOrder(
  frontFirstIds: readonly string[],
  draggedId: string,
  insertIndex: number,
): string[] {
  const without = frontFirstIds.filter((id) => id !== draggedId);
  const clamped = Math.max(0, Math.min(insertIndex, without.length));
  return [...without.slice(0, clamped), draggedId, ...without.slice(clamped)];
}

export function layerReorderInsertIndex(
  frontFirstIds: readonly string[],
  draggedId: string,
  insertBeforeId: string | null,
): number | null {
  if (insertBeforeId === null) {
    return frontFirstIds.filter((id) => id !== draggedId).length;
  }
  const without = frontFirstIds.filter((id) => id !== draggedId);
  const index = without.indexOf(insertBeforeId);
  return index < 0 ? null : index;
}

export function canDragLayerRow(
  target: ManualEditTarget,
  panelTargets: readonly ManualEditTarget[],
  allTargets: readonly ManualEditTarget[],
  options?: { activeSlideIndex?: number | null; deck?: boolean },
): boolean {
  if (!canAdjustZOrderTarget(target.cssPosition) || !target.parentKey) return false;
  const siblings = resolveLayerReorderSiblings(allTargets, target.id, options);
  if (siblings.length < 2) return false;
  const panelIds = new Set(panelTargets.map((item) => item.id));
  return siblings.every((sibling) => panelIds.has(sibling.id));
}

export function buildLayerReorderZIndexPatches(
  siblings: readonly ManualEditTarget[],
  frontFirstIds: readonly string[],
): Array<{ id: string; styles: Partial<ManualEditStyles> }> {
  const byId = new Map(siblings.map((sibling) => [sibling.id, sibling]));
  const backToFront = [...frontFirstIds].reverse();
  const patches: Array<{ id: string; styles: Partial<ManualEditStyles> }> = [];
  for (let index = 0; index < backToFront.length; index += 1) {
    const id = backToFront[index]!;
    const sibling = byId.get(id);
    if (!sibling) continue;
    const zIndex = String(index + 1);
    const nextStyles = buildZOrderStylePatch(sibling.cssPosition, zIndex);
    const currentZ = String(sibling.styles.zIndex ?? '').trim();
    const currentPos = String(sibling.cssPosition ?? 'static').toLowerCase();
    const unchanged = currentZ === zIndex
      && (nextStyles.position === undefined || currentPos === nextStyles.position);
    if (unchanged) continue;
    patches.push({ id, styles: nextStyles });
  }
  return patches;
}

export function canDropLayerOnTarget(
  draggedId: string,
  overId: string | null,
  allTargets: readonly ManualEditTarget[],
  options?: { activeSlideIndex?: number | null; deck?: boolean },
): boolean {
  const siblings = resolveLayerReorderSiblings(allTargets, draggedId, options);
  const siblingIds = new Set(siblings.map((sibling) => sibling.id));
  if (!siblingIds.has(draggedId)) return false;
  if (overId === null) return true;
  return siblingIds.has(overId);
}

export function layerReorderHistoryLabel(count: number): string {
  return count > 1 ? `Reorder: ${count} layers` : 'Reorder layer';
}
