import { readManualEditStyles } from './source-patches';
import { manualEditStyleValuesEqual } from './manual-edit-style-values';
import type { ManualEditStyles } from './types';

/**
 * Returns only style keys in `pendingStyles` that differ from the saved source.
 * Used to skip no-op revision pushes when autosave/flush replays unchanged values.
 *
 * Pass `sourceStyles` when the caller already parsed the target (FileViewer flush
 * shares one read with the subsequent apply/reconcile path).
 */
export function diffManualEditStylePatch(
  baseSource: string,
  id: string,
  pendingStyles: Partial<ManualEditStyles>,
  options?: { sourceStyles?: ManualEditStyles },
): Partial<ManualEditStyles> {
  const sourceStyles = options?.sourceStyles ?? readManualEditStyles(baseSource, id);
  const diff: Partial<ManualEditStyles> = {};
  for (const [key, value] of Object.entries(pendingStyles) as Array<[keyof ManualEditStyles, string]>) {
    const next = String(value ?? '');
    const prev = String(sourceStyles[key] ?? '');
    if (!manualEditStyleValuesEqual(key, next, prev)) diff[key] = value;
  }
  return diff;
}

export function isNoOpManualEditStyleFlush(
  baseSource: string,
  id: string,
  pendingStyles: Partial<ManualEditStyles>,
): boolean {
  return Object.keys(diffManualEditStylePatch(baseSource, id, pendingStyles)).length === 0;
}

/** Source-backed style values for the keys that were part of a no-op flush. */
export function pickManualEditSourceStylesForKeys(
  baseSource: string,
  id: string,
  keys: Array<keyof ManualEditStyles>,
): Partial<ManualEditStyles> {
  const sourceStyles = readManualEditStyles(baseSource, id);
  return keys.reduce<Partial<ManualEditStyles>>((acc, key) => {
    acc[key] = sourceStyles[key] ?? '';
    return acc;
  }, {});
}
