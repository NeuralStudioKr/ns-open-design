/**
 * Edit mode freezes the iframe HTML at entry so style saves can live-patch
 * via postMessage without reloading. If the srcDoc remounts while still in
 * edit mode (text commit freeze update, transport reset, etc.), those
 * postMessage styles are gone — but the saved `source` already holds them.
 * Diff freeze vs saved and re-post the deltas on load.
 */

import { diffManualEditStylePatch } from './manual-edit-style-batch';
import { parseManualEditSource, readManualEditStyles } from './source-patches';
import type { ManualEditStyles } from './types';

export type ManualEditStyleReplayPatch = {
  id: string;
  styles: Partial<ManualEditStyles>;
};

function collectManualEditStyleIdsFromDoc(doc: Document | null): string[] {
  if (!doc) return [];
  try {
    const ids = Array.from(doc.querySelectorAll('[data-od-id]'))
      .map((el) => (el.getAttribute('data-od-id') || '').trim())
      .filter(Boolean);
    return Array.from(new Set(ids));
  } catch {
    return [];
  }
}

/**
 * Returns per-target style patches that are present in `savedSource` but not
 * yet reflected in the frozen iframe HTML.
 */
export function manualEditStyleReplayPatches(
  frozenSource: string | null | undefined,
  savedSource: string | null | undefined,
): ManualEditStyleReplayPatch[] {
  if (!frozenSource || !savedSource || frozenSource === savedSource) return [];
  // One Document each for freeze + saved (was 2× collect parse + N× style reads).
  const frozenDoc = parseManualEditSource(frozenSource);
  const savedDoc = parseManualEditSource(savedSource);
  // Union freeze + saved ids. Preview freeze often annotates unlabeled nodes
  // with path-N `data-od-id`s that saved HTML lacks as attributes; collecting
  // only from saved would skip those targets after a srcDoc remount.
  const ids = [
    ...new Set([
      ...collectManualEditStyleIdsFromDoc(savedDoc),
      ...collectManualEditStyleIdsFromDoc(frozenDoc),
    ]),
  ];
  const patches: ManualEditStyleReplayPatch[] = [];
  for (const id of ids) {
    const savedStyles = readManualEditStyles(savedSource, id, {}, savedDoc);
    // Only restore non-empty saved styles. Freeze-only ghost ids used to
    // emit clear patches (`""`) that wiped live preview on remount.
    const pending: Partial<ManualEditStyles> = {};
    for (const [key, value] of Object.entries(savedStyles) as Array<[keyof ManualEditStyles, string]>) {
      if (typeof value === 'string' && value.trim() !== '') pending[key] = value;
    }
    if (Object.keys(pending).length === 0) continue;
    const frozenStyles = readManualEditStyles(frozenSource, id, {}, frozenDoc);
    const styles = diffManualEditStylePatch(frozenSource, id, pending, {
      sourceStyles: frozenStyles,
    });
    const restore: Partial<ManualEditStyles> = {};
    for (const [key, value] of Object.entries(styles) as Array<[keyof ManualEditStyles, string]>) {
      if (typeof value === 'string' && value.trim() !== '') restore[key] = value;
    }
    if (Object.keys(restore).length === 0) continue;
    patches.push({ id, styles: restore });
  }
  return patches;
}
