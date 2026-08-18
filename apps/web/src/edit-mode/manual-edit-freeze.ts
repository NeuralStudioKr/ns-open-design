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
 * Tip-yield arms tip-remount grace but selection echo must not post modes onto
 * a dying frame. Request od-edit-remeasure from srcDoc onLoad after
 * syncBridgeModes so grace/overlay track the remounted tip (450/452).
 */
export function shouldRequestTipRemountRemasureAfterFreezeSync(
  manualEditMode: boolean,
  selectedIds: readonly string[],
): boolean {
  return Boolean(manualEditMode && selectedIds.length > 0);
}

/**
 * Same gate as freeze remasure — used from iframe onLoad once the tip document
 * is ready (452). Requires grace still armed so unrelated loads do not spam.
 */
export function shouldRequestTipRemountRemasureAfterSrcDocLoad(
  manualEditMode: boolean,
  selectedIds: readonly string[],
  graceId: string | null | undefined,
): boolean {
  return Boolean(
    graceId
    && shouldRequestTipRemountRemasureAfterFreezeSync(manualEditMode, selectedIds),
  );
}

/**
 * Deck host-fit remounts the srcDoc shell on every previewSource change.
 * Tip-yield freeze sync already reloads via the srcDoc attribute — bumping
 * transportResetKey causes a second full remount (preview blink) (453).
 */
export function shouldSkipSrcDocTransportRemountForManualEditFreezeTipSync(
  leftStreaming: boolean,
  manualEditMode: boolean,
  hasFrozenSource: boolean,
): boolean {
  return !leftStreaming && manualEditMode && hasFrozenSource;
}

/**
 * Hide selection chrome while tip-remount wait for first remasure so overlays
 * do not flash at pre-tip composed rects (455).
 */
export function shouldSuppressManualEditChromeUntilTipRemasure(
  chromeSuppressed: boolean,
): boolean {
  return chromeSuppressed;
}

/**
 * Tip-yield freeze remount unmounts host overlays — abort an in-flight
 * resize/move session first so half-applied preview styles do not stick (457).
 */
export function shouldAbortManualEditGestureForTipYieldFreezeSync(
  resizeSessionActive: boolean,
): boolean {
  return resizeSessionActive;
}

/**
 * Failed tip remasure must not leave chrome suppressed forever (457).
 */
export function shouldReleaseTipRemountChromeOnFailedRemasure(
  chromeSuppressed: boolean,
  measuredOk: boolean,
): boolean {
  return chromeSuppressed && !measuredOk;
}

/**
 * While host resize chrome is suppressed, do not ask the iframe for hostChrome
 * (pointer-events:none + no handles) — keep the selection ring clickable (457).
 */
export function shouldPostHostChromeDuringTipRemountSuppress(
  wouldHostChrome: boolean,
  chromeSuppressed: boolean,
): boolean {
  return wouldHostChrome && !chromeSuppressed;
}

/**
 * When od-edit-targets identity fingerprint is unchanged, still patch geometry
 * for the selected set so multi overlay / chrome do not stay on pre-tip rects
 * (450 / 기획 59 + 51–53).
 */
export function shouldPatchSelectedGeometryFromTargetsBroadcast(
  targetsIdentityChanged: boolean,
  selectedIds: readonly string[],
): boolean {
  return !targetsIdentityChanged && selectedIds.length > 0;
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
 * After tip-yield Mixed→single (2→1), refresh host paint for the remaining id
 * so overlay geometry is not stuck on the prior multi primary (59 / 51–53).
 *
 * Skip while tip-remount grace is active for that id — force measure can stamp
 * a pre-layout wild rect; idle `od-edit-rect` owns geometry during grace (430).
 */
export function shouldRefreshHostPaintAfterTipYieldSingleReseed(
  selectedIds: readonly string[],
  options?: {
    graceId?: string | null;
    paintId?: string | null;
    nowMs?: number;
    graceUntilMs?: number;
  },
): boolean {
  if (selectedIds.length !== 1) return false;
  const paintId = options?.paintId ?? selectedIds[0] ?? null;
  if (
    options?.graceId
    && paintId
    && options.graceId === paintId
    && options.nowMs != null
    && options.graceUntilMs != null
    && !tipRemountGeometryGraceExpired(options.nowMs, options.graceUntilMs)
  ) {
    return false;
  }
  return true;
}

/**
 * When tip-yield single snapshot applies, sync selected target identity fields
 * so panel chrome / bridge-facing target state matches painted tip (59).
 * Same gate updates `manualEditTargets` membership for that seed id (435).
 */
export function shouldSyncSelectedTargetIdentityAfterTipYieldSingleReseed(
  selectedId: string | null | undefined,
  seedId: string,
): boolean {
  return Boolean(selectedId && selectedId === seedId);
}

/**
 * Multi tip-yield must refresh identity for every selected id from painted tip
 * (not styles-only). Otherwise text/fields/outerHtml stay pre-tip until the
 * next od-edit-targets broadcast (449 / parity with single 426–440).
 */
export function shouldSyncSelectedTargetsIdentityAfterTipYieldMultiReseed(
  selectedIds: readonly string[],
): boolean {
  return selectedIds.length > 1;
}

/**
 * After tip-remount grace is consumed by the first accepted remasure, refresh
 * host paint — covers both multi tip-yield reseed and Mixed→single (431/430).
 */
export function shouldRefreshHostPaintAfterTipRemountRemasure(
  tipRemountGraceConsumed: boolean,
): boolean {
  return tipRemountGraceConsumed;
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

/**
 * Consume tip-remount grace only when the remasure is for the grace primary
 * (same gate as wild-jump skip). Sibling multi-select remasures must not
 * clear another element's grace window (436).
 */
export function shouldConsumeTipRemountGeometryGraceOnRemasure(
  graceId: string | null | undefined,
  rectId: string,
  selectedId: string | null | undefined,
  nowMs: number,
  graceUntilMs: number,
): boolean {
  return shouldSkipWildJumpAfterTipRemountGrace(
    graceId,
    rectId,
    selectedId,
    nowMs,
    graceUntilMs,
  );
}
