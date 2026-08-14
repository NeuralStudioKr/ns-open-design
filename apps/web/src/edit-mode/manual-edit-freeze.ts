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

/**
 * Structural / text patches remount the freeze from saved HTML so the next
 * iframe paint matches disk. Style-only patches must NOT — they rely on the
 * entry freeze + `od-edit-preview-style` postMessage (and remount replay via
 * freeze→source diffs). Updating freeze on every set-style forces a full
 * srcDoc remount and flickers / drops live selection.
 */
export function shouldUpdateManualEditFrozenSourceOnPatch(
  kind: string | null | undefined,
): boolean {
  return kind !== 'set-style';
}

/**
 * Tip yield / history-confirm refresh must remount the edit freeze so the
 * iframe is not left on a pre-tip snapshot while `sourceRef` already advanced.
 * Style-only saves still leave freeze alone (see shouldUpdate…OnPatch).
 */
export function shouldSyncManualEditFrozenSourceToPainted(
  manualEditMode: boolean,
  frozenSource: string | null | undefined,
  paintedSource: string,
): boolean {
  return Boolean(
    manualEditMode
    && frozenSource != null
    && frozenSource !== paintedSource
  );
}

/**
 * Tip-yield freeze remount clears the iframe bridge selection outline.
 * Callers schedule a deferred `syncBridgeModes` / selection echo when edit
 * mode still has selected ids (onLoad + srcDoc effect usually cover this;
 * deferred echo covers lazy-transport / remount races).
 */
export function shouldEchoManualEditSelectionAfterFreezeSync(
  manualEditMode: boolean,
  selectedIds: readonly string[],
): boolean {
  return Boolean(manualEditMode && selectedIds.length > 0);
}

/**
 * Multi-select Mixed keys must reseed from painted tip source after freeze
 * remount — selection membership alone does not refresh inspector Mixed (59).
 */
export function shouldReseedManualEditMultiInspectorAfterFreezeSync(
  manualEditMode: boolean,
  selectedIds: readonly string[],
): boolean {
  return Boolean(manualEditMode && selectedIds.length > 1);
}

/**
 * Deferred tip-yield reseed skipped because selection shrank to ≤1 (2→1 / clear).
 * Stale Mixed keys from the prior multi-select must be cleared (기획 59).
 */
export function shouldClearMixedKeysAfterTipYieldReseedSkip(
  selectedIds: readonly string[],
): boolean {
  return selectedIds.length <= 1;
}

/**
 * After Mixed clear on tip-yield skip, reseed single-select inspector styles
 * from painted source when no concurrent pending draft owns the panel (59).
 */
export function shouldReseedSingleInspectorAfterTipYieldMixedClear(
  selectedIds: readonly string[],
  pendingOwnsStyles: boolean,
): boolean {
  return selectedIds.length === 1 && !pendingOwnsStyles;
}

/**
 * Tip-yield single reseed must not apply an empty snapshot shell when the
 * painted tip source dropped the node (would wipe styles/fields).
 */
export function shouldApplyTipYieldSingleInspectorSnapshot(
  snapshotOuterHtml: string | null | undefined,
): boolean {
  return Boolean(snapshotOuterHtml);
}

/**
 * Tip-remount geometry grace is bound to a primary id. When selection moves
 * away, clear grace so a later remasure for the new primary is not skipped
 * under a stale grace window (overlay residual).
 */
export function shouldClearTipRemountGeometryGraceOnSelectionChange(
  graceId: string | null | undefined,
  nextSelectedId: string | null | undefined,
): boolean {
  return Boolean(graceId && graceId !== nextSelectedId);
}

/**
 * Idle remasure saw an expired grace latch — clear id AND until so a later
 * remasure cannot skip wild-jump under a stale untilMs (overlay residual).
 */
export function shouldClearTipRemountGeometryGraceOnExpiry(
  graceId: string | null | undefined,
  nowMs: number,
  graceUntilMs: number,
): boolean {
  return Boolean(graceId && tipRemountGeometryGraceExpired(nowMs, graceUntilMs));
}

/** True when tip-remount geometry grace window has elapsed. */
export function tipRemountGeometryGraceExpired(
  nowMs: number,
  graceUntilMs: number,
): boolean {
  return nowMs >= graceUntilMs;
}

/**
 * Idle remasure after tip-yield remount may jump layout — skip wild-jump deny.
 * Requires rectId === graceId === selectedId so a sibling multi-select remasure
 * cannot consume (or be accepted under) another element's grace window.
 * Expired grace returns false so wild-jump deny is restored.
 */
export function shouldSkipWildJumpAfterTipRemountGrace(
  graceId: string | null | undefined,
  rectId: string,
  selectedId: string | null | undefined,
  nowMs: number,
  graceUntilMs: number,
): boolean {
  if (tipRemountGeometryGraceExpired(nowMs, graceUntilMs)) return false;
  return Boolean(
    graceId
    && selectedId
    && rectId === graceId
    && rectId === selectedId
  );
}
