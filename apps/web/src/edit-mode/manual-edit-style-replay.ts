/**
 * Edit mode freezes the iframe HTML at entry so style saves can live-patch
 * via postMessage without reloading. If the srcDoc remounts while still in
 * edit mode (text commit freeze update, transport reset, etc.), those
 * postMessage styles are gone — but the saved `source` already holds them.
 * Diff freeze vs saved and re-post the deltas on load.
 */

import { readManualEditStyles } from './source-patches';
import { MANUAL_EDIT_STYLE_PROPS, type ManualEditStyles } from './types';

export type ManualEditStyleReplayPatch = {
  id: string;
  styles: Partial<ManualEditStyles>;
};

function collectManualEditStyleIds(source: string): string[] {
  if (typeof DOMParser === 'undefined') return [];
  try {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const ids = Array.from(doc.querySelectorAll('[data-od-id]'))
      .map((el) => (el.getAttribute('data-od-id') || '').trim())
      .filter(Boolean);
    return Array.from(new Set(ids));
  } catch {
    return [];
  }
}

function styleDiff(
  frozen: ManualEditStyles,
  saved: ManualEditStyles,
): Partial<ManualEditStyles> {
  const styles: Partial<ManualEditStyles> = {};
  for (const key of MANUAL_EDIT_STYLE_PROPS) {
    const next = saved[key] ?? '';
    const prev = frozen[key] ?? '';
    if (next !== prev) styles[key] = next;
  }
  return styles;
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
  const ids = collectManualEditStyleIds(savedSource);
  const patches: ManualEditStyleReplayPatch[] = [];
  for (const id of ids) {
    const styles = styleDiff(
      readManualEditStyles(frozenSource, id),
      readManualEditStyles(savedSource, id),
    );
    if (Object.keys(styles).length === 0) continue;
    patches.push({ id, styles });
  }
  return patches;
}
