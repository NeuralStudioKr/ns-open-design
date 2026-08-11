import {
  applyManualEditPatches as applyManualEditPatchesOnDocument,
  isManualEditFullHtmlDocument,
  parseManualEditSource,
  readManualEditStyles,
  type ManualEditPatchResult,
} from './source-patches';
import { manualEditStyleValuesEqual } from './manual-edit-style-values';
import { diffManualEditStylePatch } from './manual-edit-style-batch';
import { pruneNestedManualEditSelectionIds } from './manual-edit-selection-ancestry';
import { emptyManualEditStyles, MANUAL_EDIT_STYLE_PROPS, type ManualEditPatch, type ManualEditStyles, type ManualEditTarget } from './types';

export const MANUAL_EDIT_MULTI_SELECT_MAX = 32;

/** Next id set after a canvas click with optional additive modifier. */
export function nextManualEditSelectionIds(
  currentIds: readonly string[],
  targetId: string,
  additive: boolean,
  max = MANUAL_EDIT_MULTI_SELECT_MAX,
  isDescendant?: (childId: string, ancestorId: string) => boolean,
): string[] {
  if (!targetId) return [];
  if (!additive) return [targetId];
  if (currentIds.includes(targetId)) {
    return currentIds.filter((id) => id !== targetId);
  }
  if (currentIds.length >= max) return [...currentIds];
  const withoutRelated = currentIds.filter(
    (id) => !isDescendant?.(id, targetId) && !isDescendant?.(targetId, id),
  );
  const next = [...withoutRelated, targetId];
  return isDescendant ? pruneNestedManualEditSelectionIds(next, isDescendant) : next;
}

export function manualEditSelectionIdsEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function resolveManualEditTargetsByIds(
  ids: readonly string[],
  catalog: readonly ManualEditTarget[],
): ManualEditTarget[] {
  const out: ManualEditTarget[] = [];
  for (const id of ids) {
    const target = catalog.find((item) => item.id === id);
    if (target) out.push(target);
  }
  return out;
}

/** Inspector draft + keys that disagree across the selection. */
export function mergeInspectorStylesForTargets(
  targets: readonly { id: string }[],
  readStyles: (id: string) => ManualEditStyles,
): { styles: ManualEditStyles; mixedKeys: Set<keyof ManualEditStyles> } {
  const mixedKeys = new Set<keyof ManualEditStyles>();
  if (targets.length === 0) {
    return { styles: emptyManualEditStyles(), mixedKeys };
  }
  const first = readStyles(targets[0]!.id);
  const merged = { ...emptyManualEditStyles(), ...first };
  for (let i = 1; i < targets.length; i += 1) {
    const styles = readStyles(targets[i]!.id);
    for (const key of MANUAL_EDIT_STYLE_PROPS) {
      const a = String(merged[key] ?? '');
      const b = String(styles[key] ?? '');
      if (!manualEditStyleValuesEqual(key, a, b)) {
        mixedKeys.add(key);
        merged[key] = '';
      }
    }
  }
  return { styles: merged, mixedKeys };
}

/**
 * While a style draft is pending, recompute mixedKeys from live targets without
 * returning merged styles that would clobber the pending inspector draft.
 */
export function mixedKeysForPendingStyleDraft(
  targets: readonly { id: string }[],
  readStyles: (id: string) => ManualEditStyles,
): Set<keyof ManualEditStyles> {
  return mergeInspectorStylesForTargets(targets, readStyles).mixedKeys;
}

export function buildManualEditStylePatchesForTargets(
  baseSource: string,
  targetIds: readonly string[],
  pendingStyles: Partial<ManualEditStyles>,
  /** Shared Document from flush — skip a second parse when apply reuses it. */
  parsedDoc?: Document | null,
): Array<Extract<ManualEditPatch, { kind: 'set-style' }>> {
  // One Document for all target diffs (was N× readManualEditStyles parses).
  const doc = parsedDoc ?? parseManualEditSource(baseSource);
  const patches: Array<Extract<ManualEditPatch, { kind: 'set-style' }>> = [];
  for (const id of targetIds) {
    const sourceStyles = readManualEditStyles(baseSource, id, {}, doc);
    const effectiveStyles = diffManualEditStylePatch(baseSource, id, pendingStyles, {
      sourceStyles,
    });
    if (Object.keys(effectiveStyles).length === 0) continue;
    patches.push({ id, kind: 'set-style', styles: effectiveStyles });
  }
  return patches;
}

/**
 * Apply many ManualEditPatch ops against one Document (multi-select / group
 * geometry commits). Delegates to source-patches batch apply — the previous
 * sequential `applyManualEditPatch` loop re-parsed for every target.
 */
export function applyManualEditPatches(
  source: string,
  patches: readonly ManualEditPatch[],
  options?: {
    sanitize?: boolean;
    captureTargetSnapshots?: boolean;
    /** Pre-parsed Document from style-diff — skip apply re-parse. */
    parsedDoc?: Document | null;
  },
): {
  ok: boolean;
  source: string;
  error?: string;
  targetSnapshots?: ManualEditPatchResult['targetSnapshots'];
} {
  if (patches.length === 0) return { ok: true, source };
  const result = applyManualEditPatchesOnDocument(
    source,
    patches.map((patch) => ({ patch })),
    {
      sanitize: options?.sanitize ?? isManualEditFullHtmlDocument(source),
      captureTargetSnapshots: options?.captureTargetSnapshots,
      parsedDoc: options?.parsedDoc,
    },
  );
  if (!result.ok) {
    return { ok: false, source, error: result.error ?? 'Could not apply edit.' };
  }
  return {
    ok: true,
    source: result.source,
    targetSnapshots: result.targetSnapshots,
  };
}

/** True when pending mult draft must flush before replacing the selection set. */
export function shouldFlushManualEditStylesOnSelectionBoundary(
  pendingTargetIds: readonly string[] | null | undefined,
  nextTargetIds: readonly string[],
): boolean {
  if (!pendingTargetIds || pendingTargetIds.length === 0) return false;
  if (nextTargetIds.length === 0) return true;
  if (pendingTargetIds.length !== nextTargetIds.length) return true;
  return !manualEditSelectionIdsEqual(pendingTargetIds, nextTargetIds);
}
