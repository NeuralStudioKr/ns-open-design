/**
 * Manual edit mode freezes the iframe HTML at entry so `set-style` can live-
 * patch via `od-edit-preview-style` without reloading the canvas. Style saves
 * update `source` / `sourceRef` but intentionally leave the freeze alone while
 * editing (to avoid iframe reload).
 *
 * Leaving edit mode MUST clear the freeze. Otherwise the next enter keeps the
 * pre-edit snapshot: exit looks correct (live source), re-enter looks reverted
 * (stale freeze). Entering always clears too so the freeze effect re-snapshots
 * from the latest live/saved source.
 */
export function shouldClearManualEditFrozenSourceOnModeChange(
  previousEnabled: boolean,
  nextEnabled: boolean,
): boolean {
  return previousEnabled !== nextEnabled;
}
