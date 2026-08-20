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
 * Prefer a same-tick host/content measure on tip srcDoc onLoad so chrome can
 * track tip geometry before async od-edit-remeasure returns (459).
 */
export function shouldApplyTipRemountSyncHostMeasureOnSrcDocLoad(
  manualEditMode: boolean,
  selectedIds: readonly string[],
  graceId: string | null | undefined,
): boolean {
  return shouldRequestTipRemountRemasureAfterSrcDocLoad(
    manualEditMode,
    selectedIds,
    graceId,
  );
}

/**
 * Sync primary measure missed on the load tick (layout/fonts not ready) —
 * schedule one rAF retry while tip-remount grace is still armed (462).
 */
export function shouldRetryTipRemountSyncHostMeasureAfterSrcDocLoad(
  syncApplied: boolean,
  manualEditMode: boolean,
  selectedIds: readonly string[],
  graceId: string | null | undefined,
): boolean {
  return !syncApplied && shouldApplyTipRemountSyncHostMeasureOnSrcDocLoad(
    manualEditMode,
    selectedIds,
    graceId,
  );
}

/**
 * Cancel a pending tip-remount sync rAF when grace clears or a newer tip-yield
 * arms — avoid measuring a dying remount session (463).
 */
export function shouldCancelTipRemountSyncHostMeasureRetry(
  pendingRaf: boolean,
): boolean {
  return pendingRaf;
}

/**
 * Sync primary measure succeeded — drop chrome inert once deck host-fit
 * settle is not still nudging stage scale (459/475).
 */
export function shouldReleaseTipRemountChromeAfterSyncHostMeasure(
  syncPrimaryMeasured: boolean,
  fitSettleUntilMs = 0,
  nowMs = 0,
): boolean {
  if (!syncPrimaryMeasured) return false;
  // Fit-settle remasures still move geometry — keep handles inert (475).
  if (fitSettleUntilMs > 0 && nowMs < fitSettleUntilMs) return false;
  return true;
}

/** Chrome becomes interactive after this fit-nudge remasure (476). */
export const TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS = 400;

/**
 * @deprecated Use TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS — kept for call-site clarity.
 */
export const TIP_REMOUNT_FIT_SETTLE_LAST_REMEASURE_MS = TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS;

/**
 * Tip remasure delays inside the fit-settle latch. Mirrors early
 * DEFAULT_FIT_NUDGE_DELAYS_MS through 1600ms so chrome does not jump after
 * the 400ms release on later fit nudges (478/481). Chrome release stays at
 * TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS — later delays are geometry only.
 */
export const TIP_REMOUNT_FIT_SETTLE_REMEASURE_DELAYS_MS = [50, 150, 400, 900, 1600] as const;

/**
 * Deck host-fit settle latch must outlive the last tip remasure delay so the
 * 1600ms nudge can still skip wild-jump and remasure (481).
 */
export const TIP_REMOUNT_FIT_SETTLE_LATCH_MS = 1_700;

/**
 * After a fit-settle remasure pass, release inert once the chrome-release
 * delay remasure applied geometry — do not wait for the full wild-jump latch
 * (476). Later in-latch remasures (900/1600ms) only update geometry (478/481).
 */
export function shouldReleaseTipRemountChromeAfterFitSettleRemasure(
  chromeSuppressed: boolean,
  appliedAny: boolean,
  remasureDelayMs: number,
  chromeReleaseDelayMs: number = TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
): boolean {
  return chromeSuppressed
    && appliedAny
    && remasureDelayMs >= chromeReleaseDelayMs;
}

/**
 * Mid-gesture fit-settle remasure would fight the resize/move draft — skip
 * apply while a Manual Edit gesture session is active (482). Chrome release
 * and later scheduled delays still run once the gesture ends.
 */
export function shouldSkipTipRemountFitSettleRemasureDuringResizeGesture(
  resizeSessionActive: boolean,
): boolean {
  return resizeSessionActive;
}

/**
 * Empty/partial od-edit-targets during tip protect is settle noise — do not
 * treat missing selected ids as a real membership leave (473).
 */
export function shouldIgnoreOdEditTargetsMembershipNoiseDuringTipProtect(
  tipProtectSource: boolean,
  selectedCount: number,
  resolvedCount: number,
  catalogLength: number,
): boolean {
  if (!tipProtectSource || selectedCount <= 0) return false;
  return catalogLength === 0 || resolvedCount < selectedCount;
}

/**
 * Empty catalog must not wipe inspector selection while tip protect is armed (473).
 */
export function shouldClearManualEditSelectionOnEmptyOdEditTargets(
  tipProtectActive: boolean,
): boolean {
  return !tipProtectActive;
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
 * Tip-remount remasure wait: keep selection chrome mounted but inert
 * (disabled gestures) at the last known rect so the selection does not feel
 * dead. Interaction resumes after tip geometry lands (455 → 458).
 */
export function shouldSuppressManualEditChromeUntilTipRemasure(
  chromeSuppressed: boolean,
): boolean {
  return chromeSuppressed;
}

/**
 * Gate overlay `disabled` while tip-remount chrome is inert (458).
 * Prefer this over unmounting — handles stay visible, gestures stay off.
 */
export function shouldDisableManualEditChromeUntilTipRemasure(
  chromeSuppressed: boolean,
): boolean {
  return shouldSuppressManualEditChromeUntilTipRemasure(chromeSuppressed);
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
 * Tip-remount inert chrome stays mounted, so hostChrome still follows the
 * normal overlay-ownership signal. Suppress must not clear hostChrome or the
 * iframe paints a second ring under the inert host box (457 → 458).
 */
export function shouldPostHostChromeDuringTipRemountSuppress(
  wouldHostChrome: boolean,
  _chromeSuppressed: boolean,
): boolean {
  return wouldHostChrome;
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
 * When deck host-fit settle is armed, wait until that window elapses too (460).
 */
export function shouldClearTipRemountGeometryGraceOnExpiry(
  graceId: string | null | undefined,
  nowMs: number,
  graceUntilMs: number,
  fitSettleUntilMs = 0,
): boolean {
  return Boolean(
    graceId
    && tipRemountGeometryGraceExpired(nowMs, graceUntilMs)
    && tipRemountFitSettleExpired(nowMs, fitSettleUntilMs),
  );
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

/** True when deck host-fit settle window has elapsed (0 = not armed). */
export function tipRemountFitSettleExpired(
  nowMs: number,
  fitSettleUntilMs: number,
): boolean {
  return fitSettleUntilMs <= 0 || nowMs >= fitSettleUntilMs;
}

/**
 * Deck host-fit often changes stage scale after onLoad sync measure (459).
 * Arm a short settle latch so chrome can remasure once fit nudges land (460).
 */
export function shouldArmTipRemountFitSettleForDeckHostFit(
  deckHostViewportFitActive: boolean,
): boolean {
  return deckHostViewportFitActive;
}

/**
 * Remasure selected targets while tip-remount fit-settle latch is live (460).
 */
export function shouldRemeasureTipRemountAfterDeckHostFitSettle(
  manualEditMode: boolean,
  selectedIds: readonly string[],
  fitSettleUntilMs: number,
  nowMs: number,
): boolean {
  return Boolean(
    manualEditMode
    && selectedIds.length > 0
    && !tipRemountFitSettleExpired(nowMs, fitSettleUntilMs),
  );
}

/**
 * onLoad may see needsDeckHostViewportFit=false while sticky fit-settle was
 * armed from deckHostViewportFitActive — still schedule; helper no-ops when
 * settle latch is unset (464).
 */
export function shouldScheduleTipRemountFitSettleRemasureOnLoad(
  fitSettleUntilMs: number,
  nowMs: number,
): boolean {
  return !tipRemountFitSettleExpired(nowMs, fitSettleUntilMs);
}

/**
 * Fit-settle window still open — do not consume tip-remount grace yet so a
 * later host-fit remasure can still skip wild-jump (460).
 */
export function shouldDeferTipRemountGraceConsumeForDeckHostFitSettle(
  fitSettleUntilMs: number,
  nowMs: number,
): boolean {
  return !tipRemountFitSettleExpired(nowMs, fitSettleUntilMs);
}

/**
 * Skip wild-jump while deck host-fit settle is armed for the grace primary,
 * even after the shorter geometry grace until has elapsed (460).
 */
export function shouldSkipWildJumpDuringTipRemountFitSettle(
  graceId: string | null | undefined,
  rectId: string,
  selectedId: string | null | undefined,
  nowMs: number,
  fitSettleUntilMs: number,
): boolean {
  if (tipRemountFitSettleExpired(nowMs, fitSettleUntilMs)) return false;
  return Boolean(
    graceId
    && selectedId
    && rectId === graceId
    && rectId === selectedId
  );
}

/**
 * Multi tip-yield: sibling remasures are in the same tip-remount session.
 * Skip wild-jump for any selected member while geometry grace is live (461).
 * Consume stays primary-only via shouldConsumeTipRemountGeometryGraceOnRemasure.
 */
export function shouldSkipWildJumpForTipRemountSelectedMember(
  graceId: string | null | undefined,
  rectId: string,
  selectedIds: readonly string[],
  nowMs: number,
  graceUntilMs: number,
): boolean {
  if (tipRemountGeometryGraceExpired(nowMs, graceUntilMs)) return false;
  return Boolean(
    graceId
    && selectedIds.includes(graceId)
    && selectedIds.includes(rectId),
  );
}

/**
 * Multi tip-yield during deck host-fit settle — same selected-set wild-jump
 * skip as geometry grace, bound to fit-settle until (461).
 */
export function shouldSkipWildJumpDuringTipRemountFitSettleForSelectedMember(
  graceId: string | null | undefined,
  rectId: string,
  selectedIds: readonly string[],
  nowMs: number,
  fitSettleUntilMs: number,
): boolean {
  if (tipRemountFitSettleExpired(nowMs, fitSettleUntilMs)) return false;
  return Boolean(
    graceId
    && selectedIds.includes(graceId)
    && selectedIds.includes(rectId),
  );
}

/**
 * Tip-remount session is live while geometry grace, deck fit-settle latch, or
 * post-settle identity hold remains (466/468).
 * Identity hold may outlive grace id clear so od-edit-targets cannot flip
 * Mixed/inspector on the first post-settle bridge broadcast.
 */
export function tipRemountSessionActive(
  graceId: string | null | undefined,
  nowMs: number,
  graceUntilMs: number,
  fitSettleUntilMs: number,
  identityHoldUntilMs = 0,
): boolean {
  if (identityHoldUntilMs > 0 && nowMs < identityHoldUntilMs) return true;
  if (!graceId) return false;
  return !tipRemountGeometryGraceExpired(nowMs, graceUntilMs)
    || !tipRemountFitSettleExpired(nowMs, fitSettleUntilMs);
}

/** Post-settle window: keep tip identity protect after grace clear (468). */
export const TIP_REMOUNT_IDENTITY_HOLD_MS = 450;

/**
 * Arm identity hold when clearing an armed tip-remount grace (468).
 */
export function nextTipRemountIdentityHoldUntilMs(
  nowMs: number,
  hadArmedGrace: boolean,
  holdMs: number = TIP_REMOUNT_IDENTITY_HOLD_MS,
): number {
  return hadArmedGrace ? nowMs + holdMs : 0;
}

/**
 * Only remasure consume / grace expiry should arm post-settle identity hold.
 * Selection leave / mode exit must drop hold so a new target is not painted
 * with the previous tip's styles (469).
 */
export function shouldArmTipRemountIdentityHoldOnGraceClear(
  reason: 'consume' | 'expiry' | 'safety' | 'selection' | 'mode-exit',
): boolean {
  return reason === 'consume' || reason === 'expiry' || reason === 'safety';
}

/**
 * Tip style preserve / identity Mixed skip apply only while tip protect is
 * active AND selection membership is unchanged (469).
 * Tip protect includes remount session/hold OR sticky post-hold retain (472).
 */
export function shouldPreserveTipSyncedStylesOnOdEditTargets(
  tipRemountActive: boolean,
  selectionIdsChanged: boolean,
): boolean {
  return tipRemountActive && !selectionIdsChanged;
}

/**
 * After tip remount settle/hold, keep tip-synced identity fill for the current
 * selection until leave/mode-exit — bridge catalogs send `outerHtml: ''` and
 * live styles that one-shot Mixed/inspector when the 450ms hold ends (472).
 */
export function shouldRetainTipSyncedIdentityAfterHold(
  tipRemountSessionActive: boolean,
  stickyRetainArmed: boolean,
  selectionIdsChanged: boolean,
): boolean {
  if (selectionIdsChanged) return false;
  return tipRemountSessionActive || stickyRetainArmed;
}

/**
 * Sticky retain clears on selection leave / mode-exit only — remasure consume
 * and grace expiry must keep it armed past the timed hold (472).
 */
export function shouldClearTipSyncedIdentityStickyRetainOnGraceClear(
  reason: 'consume' | 'expiry' | 'safety' | 'selection' | 'mode-exit',
): boolean {
  return reason === 'selection' || reason === 'mode-exit';
}

/**
 * After tip remount session/hold ends, the first complete non-noise catalog can
 * drop sticky retain so later catalogs track live identity (477).
 * The clear applies to *subsequent* broadcasts — the transition catalog should
 * still tip-preserve this tick to avoid Mixed one-shot (479).
 */
export function shouldClearTipSyncedIdentityStickyRetainOnFullCatalog(
  stickyArmed: boolean,
  tipRemountSessionActive: boolean,
  selectedCount: number,
  resolvedCount: number,
  catalogLength: number,
): boolean {
  if (!stickyArmed || tipRemountSessionActive) return false;
  if (selectedCount <= 0 || catalogLength <= 0) return false;
  return resolvedCount >= selectedCount;
}

/**
 * Compute tip protect for this od-edit-targets tick before dropping sticky so
 * the transition catalog still preserves tip identity (479).
 */
export function shouldDeferTipSyncedIdentityStickyClearUntilAfterPreserve(
  clearStickyForLaterCatalogs: boolean,
): boolean {
  return clearStickyForLaterCatalogs;
}

/**
 * After sticky clear, soft-land tip identity for a few more catalogs so Mixed /
 * membership do not one-shot on the first live bridge broadcast (480/483).
 */
export const TIP_POST_STICKY_SOFT_LAND_CATALOGS = 2;

/**
 * Arm post-sticky soft-land when sticky is deferred-cleared for later catalogs.
 */
export function shouldArmTipPostStickySoftLand(
  clearStickyAfterPreserve: boolean,
): boolean {
  return clearStickyAfterPreserve;
}

/**
 * Soft-land remaining catalogs keep tip identity protect / Mixed skip /
 * membership noise ignore (480/483).
 */
export function shouldRetainTipSyncedIdentityDuringPostStickySoftLand(
  softLandRemaining: number,
  selectionIdsChanged: boolean,
): boolean {
  return softLandRemaining > 0 && !selectionIdsChanged;
}

/**
 * Consume one soft-land catalog after a tick that entered with soft-land armed
 * (do not consume on the sticky-clear tick that arms it) (480).
 */
export function consumeTipPostStickySoftLandCatalog(
  softLandRemainingAtEntry: number,
  selectionIdsChanged: boolean,
): number {
  if (selectionIdsChanged || softLandRemainingAtEntry <= 0) {
    return selectionIdsChanged ? 0 : softLandRemainingAtEntry;
  }
  return softLandRemainingAtEntry - 1;
}

/**
 * Arm a one-shot wild-jump skip after a tip fit-settle remasure so a late
 * deck nudge that lands past the latch (or races expiry) is not dropped (485).
 */
export function shouldArmPostTipFitSettleWildJumpSkip(
  remasureAppliedAny: boolean,
  selectionCount: number,
): boolean {
  return remasureAppliedAny && selectionCount > 0;
}

/**
 * One-shot wild-jump skip for a selected member after tip fit-settle remasure.
 */
export function shouldSkipWildJumpOnceAfterTipFitSettle(
  oneShotArmed: boolean,
  rectId: string,
  selectedIds: readonly string[],
): boolean {
  return oneShotArmed && selectedIds.includes(rectId);
}

/**
 * Consume the post-fit-settle wild-jump one-shot once it covers a remasure.
 */
export function shouldConsumePostTipFitSettleWildJumpSkip(
  oneShotArmed: boolean,
  skippedForThisRect: boolean,
): boolean {
  return oneShotArmed && skippedForThisRect;
}

/**
 * Single-select od-edit-targets identity reseed must use source styles only —
 * merging bridge preview fills empty tip keys and flickers the inspector (468).
 */
export function shouldReadSingleInspectorStylesFromSourceOnlyForOdEditTargets(): boolean {
  return true;
}

/**
 * od-edit-targets after tip-yield can flip selected identity via bridge
 * `target.styles` (live preview) and re-fire Mixed reseed — flicker even when
 * Mixed is source-only. Skip identity-only Mixed/draft reseed while tip
 * remount is settling; membership changes still reseed (466).
 * Pending style drafts must NOT be blank-skipped — tip-yield already respects
 * concurrent pending ownership (471).
 */
export function shouldSkipOdEditTargetsIdentityMixedReseedDuringTipRemount(
  selectionIdsChanged: boolean,
  tipRemountActive: boolean,
  styleDraftPending = false,
): boolean {
  if (styleDraftPending) return false;
  return tipRemountActive && !selectionIdsChanged;
}

/**
 * Pending Mixed/field refresh during tip protect: tip identity preserve can
 * freeze the selected fingerprint so the usual identity-changed gate never
 * fires — still allow the pending-aware path (471).
 */
export function shouldAllowOdEditTargetsPendingReseedDuringTipProtect(
  styleDraftPending: boolean,
  selectionIdsChanged: boolean,
  selectedTargetsIdentityChanged: boolean,
  tipRemountProtectActive: boolean,
): boolean {
  if (!styleDraftPending || selectionIdsChanged) return false;
  return selectedTargetsIdentityChanged || tipRemountProtectActive;
}

/**
 * Keep tip-synced styles on a bridge target while tip remount settles so
 * identity fingerprint / Mixed do not flip from live preview styles (467).
 */
export function withPreservedTipSyncedStylesOnBridgeTarget<T extends {
  styles: unknown;
}>(
  bridge: T,
  tipStyles: T['styles'] | null | undefined,
): T {
  if (tipStyles == null) return bridge;
  return { ...bridge, styles: tipStyles };
}

/**
 * Tip styles for a selected id during od-edit-targets preserve: primary ref
 * first, then prior catalog (closure state before bridge replace) (467).
 */
export function resolveTipSyncedStylesForOdEditTargetsPreserve<T extends {
  id: string;
  styles: unknown;
}>(
  targetId: string,
  primary: T | null | undefined,
  priorCatalog: readonly T[],
): T['styles'] | undefined {
  if (primary?.id === targetId) return primary.styles;
  return priorCatalog.find((item) => item.id === targetId)?.styles;
}

/**
 * Tip target for od-edit-targets identity preserve: primary ref first, then
 * prior catalog (470).
 */
export function resolveTipSyncedTargetForOdEditTargetsPreserve<T extends {
  id: string;
}>(
  targetId: string,
  primary: T | null | undefined,
  priorCatalog: readonly T[],
): T | undefined {
  if (primary?.id === targetId) return primary;
  return priorCatalog.find((item) => item.id === targetId);
}

/**
 * Preserve tip-synced identity on a bridge target (text/fields/outerHtml/
 * className/styles/…) while keeping bridge geometry. Bridge catalogs often
 * send `outerHtml: ''`, which flips fingerprint after styles-only preserve (470).
 */
export function withPreservedTipSyncedIdentityOnBridgeTarget<T extends {
  styles: unknown;
  kind: unknown;
  label: unknown;
  tagName: unknown;
  className: unknown;
  text: unknown;
  fields: unknown;
  attributes: unknown;
  isLayoutContainer: unknown;
  isHidden?: unknown;
  outerHtml: unknown;
}>(
  bridge: T,
  tip: T | null | undefined,
): T {
  if (!tip) return bridge;
  return {
    ...bridge,
    kind: tip.kind,
    label: tip.label,
    tagName: tip.tagName,
    className: tip.className,
    text: tip.text,
    fields: tip.fields,
    attributes: tip.attributes,
    styles: tip.styles,
    isLayoutContainer: tip.isLayoutContainer,
    isHidden: tip.isHidden,
    outerHtml: tip.outerHtml,
  };
}

/**
 * After multi tip remasure, refresh host scale/offset + geom epoch so union
 * chrome compose and live measureHostRect stay aligned (461).
 */
export function shouldRefreshHostMetricsAfterTipRemountMultiRemasure(
  selectedCount: number,
  appliedAny: boolean,
): boolean {
  return appliedAny && selectedCount >= 2;
}
