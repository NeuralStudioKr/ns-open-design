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
 *
 * ---------------------------------------------------------------------------
 * Tip remount index (566) — user-perception sequences & key constants
 * ---------------------------------------------------------------------------
 * Post-protect: TIP_REMOUNT_POST_PROTECT_SEQUENCE
 *   sticky-clear → soft-land → exit-latch → absorb → post-absorb-quiet → live
 * Chrome release prefix: TIP_REMOUNT_CHROME_RELEASE_PREFIX
 *   chrome-suppress → fit-remasure → chrome-release
 * Then **parallel tracks** (540) — not one causal chain:
 *   paint: TIP_REMOUNT_PAINT_SYNC_TRACK
 *     paint-sync-hold → geom-epoch-flush → live
 *   pointer: TIP_REMOUNT_POINTER_UNLOCK_TRACK
 *     unlock-pointer-gate → pointerup-deferred-flush → post-unlock-quiet → live
 * TIP_REMOUNT_CHROME_RELEASE_SEQUENCE remains a concatenated view for older pins.
 * Timing:
 *   TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS (400)
 *   TIP_REMOUNT_FIT_SETTLE_REMEASURE_DELAYS_MS [50,150,400,900,1600]
 *   TIP_REMOUNT_FIT_SETTLE_LATCH_MS (1700)
 *   TIP_REMOUNT_DECK_NUDGE_FOLLOW_MS / TIP_REMOUNT_POST_UNLOCK_QUIET_TIMEOUT_MS
 * Soft-land catalogs: TIP_POST_STICKY_SOFT_LAND_CATALOGS (2) — intentional.
 * Layout paint: seed/apply last-good during tip session or paint-sync hold (543).
 * Selection commit: hostPaintRectForManualEditSelectionCommit (546).
 * Multi commit: shouldRefreshHostPaintOnManualEditSelectionCommit also
 *   refreshes primary during tip/paint-sync so union measure warms (552).
 * Multi sibling seed: shouldSeedTipRemountMemberLastHostRectsOnMultiCommit (555);
 *   one rAF retry when iframe/layout not ready (558);
 *   retry only when selection ids unchanged (561);
 *   cancel pending retry on selection clear/boundary (564).
 * Seed → union: expectedTipRemountUnionPaintBearingCount floors
 *   paintBearingCount during tip/paint-sync (562).
 * Last-good cache: prune to selected ids on tip/paint-sync commit (565).
 * Refresh miss: resolveTipRemountRefreshMissAction — last-good → retain →
 *   force-keep → clear (549/550). Selection-commit last-good feeds the same
 *   last-good branch on the following refresh.
 * Overlay paint: resolveTipRemountHostPaintRectResult — live seed + last-good
 *   fallback in one entry (553/556); apply-last-good matches Result (559).
 * Intentional nulls (5): mode-exit / no-id / refresh(!id) / unprotected miss /
 *   clear-selection.
 * Walk fixtures: apps/web/tests/edit-mode/tip-remount-sequence-fixtures.ts (547).
 * Checklist: docs-teamver/49_tip_remount_체감_체크리스트_500-566.md (566).
 * Do not retune fit delays / latch / soft-land without a tip-remount loop note.
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
 * Chrome-release delay remasure applied nothing (iframe/layout not ready) —
 * still drop inert so handles are not stuck until the ~1.7s safety clear (512).
 * Later 900/1600ms remasures can still catch geometry up.
 */
export function shouldReleaseTipRemountChromeAfterFailedFitSettleRemasure(
  chromeSuppressed: boolean,
  appliedAny: boolean,
  remasureDelayMs: number,
  chromeReleaseDelayMs: number = TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
): boolean {
  return chromeSuppressed
    && !appliedAny
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
 * Soft-land early exit when live bridge selected identity already matches the
 * tip-preserved fingerprint — no need to keep protecting (488).
 */
export function shouldEarlyExitTipPostStickySoftLand(
  softLandRemainingAtEntry: number,
  selectionIdsChanged: boolean,
  preservedSelectedFingerprint: string,
  liveBridgeSelectedFingerprint: string,
): boolean {
  if (selectionIdsChanged || softLandRemainingAtEntry <= 0) return false;
  return preservedSelectedFingerprint === liveBridgeSelectedFingerprint;
}

/**
 * After soft-land's last catalog, arm one exit latch catalog so the first live
 * bridge broadcast cannot one-shot Mixed via fingerprint absorb (486).
 */
export function shouldArmTipPostSoftLandExitLatch(
  softLandAtEntry: number,
  softLandRemainingAfter: number,
  selectionIdsChanged: boolean,
  earlyExited: boolean,
): boolean {
  if (selectionIdsChanged || earlyExited) return false;
  return softLandAtEntry > 0 && softLandRemainingAfter === 0;
}

/**
 * Exit latch keeps tip identity preserve / Mixed skip for one catalog (486).
 */
export function shouldRetainTipSyncedIdentityDuringPostSoftLandExitLatch(
  exitLatchArmed: boolean,
  selectionIdsChanged: boolean,
): boolean {
  return exitLatchArmed && !selectionIdsChanged;
}

/**
 * Exit-latch tick spends the latch — later catalogs go live (486/502/505).
 * No arguments: the call site only runs when the latch was armed at entry.
 */
export function clearTipPostSoftLandExitLatch(): false {
  return false;
}

/**
 * During soft-land / exit latch, pin selected identity fingerprint to the
 * preserved catalog so exit does not see a stale→live flip as membership (490).
 */
export function shouldLatchSelectedIdentityFingerprintDuringTipSoftLand(
  tipSoftLandProtectActive: boolean,
  selectionIdsChanged: boolean,
): boolean {
  return tipSoftLandProtectActive && !selectionIdsChanged;
}

/**
 * After exit-latch preserve spends, arm one Mixed-absorb tick — live FP is
 * accepted into refs without tip preserve / Mixed reseed (491).
 */
export function shouldArmTipPostExitLatchMixedAbsorb(
  exitLatchAtEntry: boolean,
  selectionIdsChanged: boolean,
): boolean {
  return exitLatchAtEntry && !selectionIdsChanged;
}

/**
 * Soft-land early-exit also arms Mixed-absorb so the next live catalog can
 * sync FP without a preserve latch (493 + 491).
 */
export function shouldArmTipPostExitLatchMixedAbsorbOnSoftLandEarlyExit(
  earlyExited: boolean,
  selectionIdsChanged: boolean,
): boolean {
  return earlyExited && !selectionIdsChanged;
}

/**
 * Skip identity-only Mixed reseed while post-exit absorb is armed (491).
 * Pending drafts stay reachable (same carve-out as tip remount).
 */
export function shouldSkipOdEditTargetsIdentityMixedReseedDuringPostExitAbsorb(
  selectionIdsChanged: boolean,
  absorbArmed: boolean,
  styleDraftPending = false,
): boolean {
  if (styleDraftPending) return false;
  return absorbArmed && !selectionIdsChanged;
}

/**
 * Absorb live catalog/selected fingerprints into refs on the post-exit tick,
 * then clear the absorb latch (491).
 */
export function shouldAbsorbLiveIdentityFingerprintOnPostExitLatch(
  absorbArmed: boolean,
  selectionIdsChanged: boolean,
): boolean {
  return absorbArmed && !selectionIdsChanged;
}

/**
 * Early-exit: sync selected identity FP ref to the live bridge fingerprint so
 * the next catalog does not false-churn against a stale preserved latch (493).
 */
export function shouldSyncSelectedIdentityFingerprintOnSoftLandEarlyExit(
  earlyExited: boolean,
  selectionIdsChanged: boolean,
): boolean {
  return earlyExited && !selectionIdsChanged;
}

/**
 * Multi exit-latch: keep Mixed/inspector on source styles only — geometry may
 * still track the bridge via tip identity preserve (495).
 */
export function shouldKeepMultiInspectorSourceOnlyDuringTipExitLatch(
  exitLatchActive: boolean,
  selectedCount: number,
): boolean {
  return exitLatchActive && selectedCount > 1;
}

/**
 * Single-select od-edit-targets identity reseed must also skip during post-exit
 * absorb — same latch as Mixed, so draft styles do not flicker (496).
 */
export function shouldSkipOdEditTargetsSingleInspectorReseedDuringPostExitAbsorb(
  selectionIdsChanged: boolean,
  absorbArmed: boolean,
  styleDraftPending = false,
): boolean {
  return shouldSkipOdEditTargetsIdentityMixedReseedDuringPostExitAbsorb(
    selectionIdsChanged,
    absorbArmed,
    styleDraftPending,
  );
}

/**
 * Absorb counts as tip-protect for membership noise / empty catalog (498).
 */
export function shouldTreatPostExitAbsorbAsTipProtect(
  absorbArmed: boolean,
): boolean {
  return absorbArmed;
}

/**
 * Absorb tick must source-only settle inspector draft once — otherwise tip-
 * preserved draft styles stick after FP absorb when identity is unchanged
 * (early-exit) or when Mixed skip blocks the live reseed (511).
 * Pending drafts stay owned by the user (기획 59).
 */
export function shouldSettleInspectorStylesOnPostExitAbsorb(
  absorbArmed: boolean,
  selectionIdsChanged: boolean,
  styleDraftPending = false,
): boolean {
  if (styleDraftPending || selectionIdsChanged) return false;
  return absorbArmed;
}

/**
 * Pending style draft wins over absorb inspector settle — fields/mixedKeys may
 * still refresh via the pending-aware path (514 / 기획 59).
 */
export function shouldPreferPendingDraftOverAbsorbInspectorSettle(
  styleDraftPending: boolean,
  absorbArmed: boolean,
): boolean {
  return styleDraftPending && absorbArmed;
}

/**
 * After chrome is interactive (or at chrome-release delay), refresh host
 * scale/offset before applying tip geometry so handles do not double-jump from
 * stale compose metrics (513).
 */
export function shouldRefreshHostMetricsBeforeTipRemountGeometryApply(
  hasMeasuredGeometry: boolean,
  chromeSuppressed: boolean,
  remasureDelayMs: number,
  chromeReleaseDelayMs: number = TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
): boolean {
  if (!hasMeasuredGeometry) return false;
  if (!chromeSuppressed) return true;
  return remasureDelayMs >= chromeReleaseDelayMs;
}

/**
 * After absorb syncs live fingerprints, keep one quiet catalog so the first
 * post-absorb live bridge broadcast cannot one-shot Mixed/inspector (509).
 */
export function shouldArmTipPostAbsorbInspectorQuiet(
  absorbSpent: boolean,
  selectionIdsChanged: boolean,
): boolean {
  return absorbSpent && !selectionIdsChanged;
}

/**
 * Post-absorb quiet skips identity Mixed/single reseed (not tip-preserve) (509).
 * Pending drafts stay reachable (same carve-out as absorb).
 */
export function shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet(
  selectionIdsChanged: boolean,
  quietArmed: boolean,
  styleDraftPending = false,
): boolean {
  if (styleDraftPending) return false;
  return quietArmed && !selectionIdsChanged;
}

/**
 * Quiet latch also tip-protects empty-catalog / membership noise for one tick (509).
 */
export function shouldTreatPostAbsorbQuietAsTipProtect(
  quietArmed: boolean,
): boolean {
  return quietArmed;
}

/**
 * Quiet tick spends the latch — later catalogs go fully live (509).
 */
export function clearTipPostAbsorbInspectorQuiet(): false {
  return false;
}

/**
 * od-edit-targets membership actually changed (not tip-protect noise) — drop
 * soft-land / absorb / quiet / follow so the new set is not painted with tip
 * post-protect (508).
 */
export function shouldClearTipPostProtectOnOdEditTargetsSelectionIdsChange(
  selectionIdsChangedEarly: boolean,
): boolean {
  return selectionIdsChangedEarly;
}

/**
 * Selection primary changed or cleared after grace is already gone — still drop
 * sticky/soft-land/absorb/follow so a new target is not painted with tip protect (499).
 */
export function shouldClearTipPostProtectOnSelectionChange(
  currentPrimaryId: string | null | undefined,
  nextSelectedId: string | null | undefined,
): boolean {
  if (currentPrimaryId == null && nextSelectedId == null) return false;
  return currentPrimaryId !== nextSelectedId;
}

/**
 * Mode-exit clearGrace only when tip remount post-protect state is armed —
 * skip the initial mount when everything is already idle (503).
 */
export function shouldClearTipRemountOnManualEditModeExit(
  manualEditMode: boolean,
  tipRemountPostProtectArmed: boolean,
): boolean {
  return !manualEditMode && tipRemountPostProtectArmed;
}

/**
 * True when any tip remount soft-land / absorb / follow / chrome latch is live
 * (503) — used to gate mode-exit clearGrace.
 */
export function tipRemountPostProtectArmed(input: {
  graceId?: string | null;
  stickyRetain?: boolean;
  softLandRemaining?: number;
  exitLatch?: boolean;
  absorb?: boolean;
  postAbsorbQuiet?: boolean;
  followUntilMs?: number;
  chromeSuppressed?: boolean;
  followChromeTimeoutPending?: boolean;
  remountSafetyTimeoutPending?: boolean;
}): boolean {
  return Boolean(
    input.graceId
    || input.stickyRetain
    || (input.softLandRemaining != null && input.softLandRemaining > 0)
    || input.exitLatch
    || input.absorb
    || input.postAbsorbQuiet
    || (input.followUntilMs != null && input.followUntilMs > 0)
    || input.chromeSuppressed
    || input.followChromeTimeoutPending
    || input.remountSafetyTimeoutPending
  );
}

/**
 * Follow-end chrome release must not race an in-flight tip remount safety
 * clear — wait until safety timeout is gone (499/510).
 */
export function shouldReleaseTipRemountChromeWhenDeckNudgeFollowEnds(
  chromeSuppressed: boolean,
  followWindowEnded: boolean,
  tipRemountSafetyTimeoutPending = false,
): boolean {
  return chromeSuppressed && followWindowEnded && !tipRemountSafetyTimeoutPending;
}

/**
 * Follow-end wanted chrome release but safety timeout was still pending —
 * defer and retry after safety callback nulls the ref (510).
 */
export function shouldDeferTipRemountChromeReleaseAfterFollowEndBlockedBySafety(
  chromeSuppressed: boolean,
  followWindowEnded: boolean,
  tipRemountSafetyTimeoutPending: boolean,
): boolean {
  return chromeSuppressed && followWindowEnded && tipRemountSafetyTimeoutPending;
}

/**
 * After safety timeout fires (ref already nulled), flush a deferred follow-end
 * chrome release if chrome is still inert (510).
 */
export function shouldFlushDeferredTipRemountChromeReleaseAfterSafety(
  deferredRelease: boolean,
  chromeSuppressed: boolean,
  tipRemountSafetyTimeoutPending: boolean,
): boolean {
  return deferredRelease && chromeSuppressed && !tipRemountSafetyTimeoutPending;
}

/**
 * How long tip remount follows late deck fit nudges (covers DEFAULT 6500ms) (487).
 */
export const TIP_REMOUNT_DECK_NUDGE_FOLLOW_MS = 7_000;

/** Throttle ResizeObserver-driven tip remasures during deck-nudge follow (492). */
export const TIP_REMOUNT_DECK_NUDGE_REMEASURE_THROTTLE_MS = 100;

/**
 * Arm deck-nudge follow window when tip-yield remount starts (487).
 */
export function nextTipRemountDeckNudgeFollowUntilMs(
  nowMs: number,
  arm: boolean,
  followMs: number = TIP_REMOUNT_DECK_NUDGE_FOLLOW_MS,
): number {
  return arm ? nowMs + followMs : 0;
}

/**
 * Remasure tip chrome on a host deck fit nudge while follow window is live (487).
 * Does not extend the wild-jump fit-settle latch.
 */
export function shouldRemeasureTipRemountOnDeckHostFitNudge(
  manualEditMode: boolean,
  selectedIds: readonly string[],
  followUntilMs: number,
  nowMs: number,
): boolean {
  return Boolean(
    manualEditMode
    && selectedIds.length > 0
    && followUntilMs > 0
    && nowMs < followUntilMs,
  );
}

/**
 * Throttle follow-only deck-nudge remasures (fit-settle latch remasures stay
 * on their scheduled delays) (492).
 */
export function shouldThrottleTipRemountDeckNudgeRemasure(
  lastRemasureAtMs: number,
  nowMs: number,
  throttleMs: number = TIP_REMOUNT_DECK_NUDGE_REMEASURE_THROTTLE_MS,
): boolean {
  return lastRemasureAtMs > 0 && (nowMs - lastRemasureAtMs) < throttleMs;
}

/**
 * Follow remasure was throttled but chrome is interactive — still refresh host
 * scale/offset so late deck nudges do not leave the box misaligned (517).
 */
export function shouldCatchUpHostMetricsWhenDeckNudgeRemasureThrottled(
  inFollowWindow: boolean,
  fitSettleExpired: boolean,
  remasureThrottled: boolean,
  chromeSuppressed: boolean,
): boolean {
  return inFollowWindow
    && fitSettleExpired
    && remasureThrottled
    && !chromeSuppressed;
}

/**
 * After chrome is interactive, defer late fit remasure geometry one tick while
 * the pointer is over selection chrome — or while unlock pointer gate is still
 * armed — so handles do not jump under the cursor (516/525). Post-unlock quiet
 * forces one immediate apply so the first remasure after pointerup does not
 * re-defer (528). Metrics may still refresh immediately.
 */
export function shouldDeferTipRemountPostReleaseGeometryApply(
  chromeSuppressed: boolean,
  remasureDelayMs: number,
  pointerOverChrome: boolean,
  chromeReleaseDelayMs: number = TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
  unlockPointerGateArmed = false,
  postUnlockQuietArmed = false,
): boolean {
  if (postUnlockQuietArmed) return false;
  return !chromeSuppressed
    && remasureDelayMs >= chromeReleaseDelayMs
    && (pointerOverChrome || unlockPointerGateArmed);
}

/**
 * On unlock-gate pointerup, flush deferred geometry before clearing the gate so
 * chrome becomes interactive on the latest measure, not a stale box (525).
 */
export function shouldFlushDeferredTipRemountGeometryBeforeUnlockGateClear(
  unlockPointerGateArmed: boolean,
  deferredGeometryPending: boolean,
): boolean {
  return unlockPointerGateArmed && deferredGeometryPending;
}

/**
 * Clearing unlock gate on pointerup — arm one quiet remasure tick so the next
 * late remasure does not immediately re-defer / re-arm the gate (528).
 */
export function shouldArmTipRemountPostUnlockQuiet(
  unlockingGate: boolean,
): boolean {
  return unlockingGate;
}

/**
 * Quiet spends on the next remasure attempt after unlock gate clear (528).
 */
export function shouldSpendTipRemountPostUnlockQuiet(
  quietArmed: boolean,
  remasureAttempted: boolean,
): boolean {
  return quietArmed && remasureAttempted;
}

/** Quiet tick done — later remasures may defer again (528). */
export function clearTipRemountPostUnlockQuiet(): false {
  return false;
}

/**
 * Post-unlock quiet with no remasure (resize-skip / follow idle) must not stick —
 * force-spend on follow end or quiet timeout (531).
 */
export const TIP_REMOUNT_POST_UNLOCK_QUIET_TIMEOUT_MS = 2_000;

export function shouldForceSpendTipRemountPostUnlockQuiet(
  quietArmed: boolean,
  followEnded: boolean,
  quietTimedOut = false,
): boolean {
  return quietArmed && (followEnded || quietTimedOut);
}

/**
 * Replace deferred geometry payload when a newer deferred remasure arrives —
 * the pending rAF must apply only the latest measure (519).
 */
export function shouldReplaceDeferredTipRemountGeometryPayload(
  deferring: boolean,
  hasMeasuredGeometry: boolean,
): boolean {
  return deferring && hasMeasuredGeometry;
}

/**
 * Immediate (non-deferred) geometry apply must invalidate any pending deferred
 * rAF so a stale 900ms payload cannot overwrite a later 1600ms apply (519).
 */
export function shouldInvalidateDeferredTipRemountGeometryOnImmediateApply(
  applyingImmediately: boolean,
  deferredPayloadPending: boolean,
): boolean {
  return applyingImmediately && deferredPayloadPending;
}

/**
 * Chrome just unlocked while the pointer is still over chrome or any pointer
 * button is down — keep chrome gated until pointerup so the unlock frame does
 * not eat the first gesture (520/522). Post-unlock quiet blocks re-arm (528).
 */
export function shouldArmTipRemountChromeUnlockPointerGate(
  wasChromeSuppressed: boolean,
  nowChromeSuppressed: boolean,
  pointerOverChrome: boolean,
  pointerButtonsDown = false,
  postUnlockQuietArmed = false,
): boolean {
  if (postUnlockQuietArmed) return false;
  return wasChromeSuppressed
    && !nowChromeSuppressed
    && (pointerOverChrome || pointerButtonsDown);
}

/**
 * Unlock gate keeps overlays disabled until pointerup clears it (520).
 */
export function shouldDisableManualEditChromeForTipRemountUnlockGate(
  tipRemountChromeInert: boolean,
  unlockPointerGateArmed: boolean,
): boolean {
  return tipRemountChromeInert || unlockPointerGateArmed;
}

/**
 * During tip remount follow/settle, reuse the last good host paint when a live
 * measure misses — avoids multi/single chrome flashing to composed fallback
 * (521/523). Paint-sync hold also reuses last-good so inert→interactive does
 * not null the box (538).
 */
export function shouldReuseLastHostRectOnTipRemountMeasureMiss(
  tipRemountChromeSessionLive: boolean,
  measuredPaintOk: boolean,
  hasLastGoodHostRect: boolean,
  paintSyncHoldArmed = false,
): boolean {
  return (tipRemountChromeSessionLive || paintSyncHoldArmed)
    && !measuredPaintOk
    && hasLastGoodHostRect;
}

/**
 * Tip remount / paint-sync: keep the current host paint when a remasure misses
 * and there is no last-good yet — avoid single-overlay null flash (538/546).
 */
export function shouldRetainCurrentHostPaintOnTipRemountPaintMiss(
  paintSyncHoldArmed: boolean,
  measuredPaintOk: boolean,
  hasCurrentHostPaint: boolean,
  tipRemountChromeSessionLive = false,
): boolean {
  return (paintSyncHoldArmed || tipRemountChromeSessionLive)
    && !measuredPaintOk
    && hasCurrentHostPaint;
}

/**
 * Layout-effect live paint success during tip remount / paint-sync must seed
 * last-good — otherwise a later miss has nothing to reuse (543).
 */
export function shouldSeedTipRemountLastHostRectFromLivePaint(
  tipRemountChromeSessionLive: boolean,
  paintSyncHoldArmed: boolean,
  measuredPaintOk: boolean,
): boolean {
  return measuredPaintOk && (tipRemountChromeSessionLive || paintSyncHoldArmed);
}

/**
 * Layout-effect paint miss during tip remount / paint-sync: apply last-good
 * when current host paint is empty (543). Distinct from retain-current (538).
 */
export function shouldApplyTipRemountLastHostRectOnLayoutPaintMiss(
  tipRemountChromeSessionLive: boolean,
  paintSyncHoldArmed: boolean,
  measuredPaintOk: boolean,
  hasCurrentHostPaint: boolean,
  hasLastGoodHostRect: boolean,
): boolean {
  return !measuredPaintOk
    && !hasCurrentHostPaint
    && hasLastGoodHostRect
    && (tipRemountChromeSessionLive || paintSyncHoldArmed);
}

export type TipRemountHostPaintRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Selection commit used to always null host paint before refresh. During tip
 * remount / paint-sync, prefer next-primary last-good so refresh early-return
 * or multi-select commit does not flash hybrid compose (546).
 *
 * Intentional null sites (do not route through this helper): mode-exit,
 * layout sync with no selectedId, clearManualEditTargetSelection, and
 * refreshManualEditHostPaintRect(!id / unprotected miss).
 */
export function hostPaintRectForManualEditSelectionCommit(
  tipRemountChromeSessionLive: boolean,
  paintSyncHoldArmed: boolean,
  lastGoodForPrimary: TipRemountHostPaintRect | null,
): TipRemountHostPaintRect | null {
  if (tipRemountChromeSessionLive || paintSyncHoldArmed) {
    return lastGoodForPrimary;
  }
  return null;
}

/**
 * After selection commit, refresh primary host paint.
 * Single always refreshes. Multi also refreshes during tip/paint-sync so
 * last-good cache + host metrics warm before union chrome measures (552).
 */
export function shouldRefreshHostPaintOnManualEditSelectionCommit(
  selectedCount: number,
  tipRemountChromeSessionLive: boolean,
  paintSyncHoldArmed: boolean,
): boolean {
  if (selectedCount === 1) return true;
  return selectedCount >= 2
    && (tipRemountChromeSessionLive || paintSyncHoldArmed);
}

/**
 * Multi selection commit during tip/paint-sync: measure and seed last-good for
 * every selected member so union measureHostRect miss can reuse per-id boxes
 * (not only primary) on the first overlay paint (555).
 */
export function shouldSeedTipRemountMemberLastHostRectsOnMultiCommit(
  selectedCount: number,
  tipRemountChromeSessionLive: boolean,
  paintSyncHoldArmed: boolean,
): boolean {
  return selectedCount >= 2
    && (tipRemountChromeSessionLive || paintSyncHoldArmed);
}

/**
 * Multi sibling last-good seed missed some members (iframe/layout not ready) —
 * schedule one rAF retry while tip/paint-sync is still armed (558).
 */
export function shouldRetryTipRemountMemberLastHostRectSeed(
  memberCount: number,
  seededCount: number,
  tipRemountChromeSessionLive: boolean,
  paintSyncHoldArmed: boolean,
  alreadyRetried: boolean,
): boolean {
  if (alreadyRetried) return false;
  if (!(tipRemountChromeSessionLive || paintSyncHoldArmed)) return false;
  if (memberCount < 2) return false;
  return seededCount < memberCount;
}

/**
 * Cancel a pending multi-member last-good seed rAF when tip clears or a newer
 * selection arms (558) — same shape as sync-measure retry cancel (463).
 */
export function shouldCancelTipRemountMemberLastHostRectSeedRetry(
  pendingRaf: boolean,
): boolean {
  return pendingRaf;
}

/**
 * Selection clear / id-set change must drop a pending sibling seed retry —
 * otherwise clear→reselect same ids can apply a stale rAF seed (564).
 * Complements shouldApplyTipRemountMemberLastHostRectSeedRetry (561).
 */
export function shouldCancelTipRemountMemberLastHostRectSeedRetryOnSelectionBoundary(
  pendingRaf: boolean,
  selectionBoundaryChanged: boolean,
): boolean {
  return pendingRaf && selectionBoundaryChanged;
}

/**
 * Seed-retry rAF must only apply when selection membership (order + ids) is
 * unchanged since schedule — drop stale retries after selection churn (561).
 */
export function shouldApplyTipRemountMemberLastHostRectSeedRetry(
  expectedIds: readonly string[],
  currentIds: readonly string[],
): boolean {
  if (expectedIds.length !== currentIds.length) return false;
  return expectedIds.every((id, index) => currentIds[index] === id);
}

/**
 * Tip/paint-sync: union measureHostRect reuses last-good on miss, so
 * paintBearingCount is at least the seeded member count (562).
 */
export function expectedTipRemountUnionPaintBearingCount(
  tipRemountChromeSessionLive: boolean,
  paintSyncHoldArmed: boolean,
  memberCount: number,
  seededLastGoodCount: number,
  livePaintBearingCount: number,
): number {
  if (!(tipRemountChromeSessionLive || paintSyncHoldArmed)) {
    return livePaintBearingCount;
  }
  return Math.min(
    memberCount,
    Math.max(livePaintBearingCount, seededLastGoodCount),
  );
}

/**
 * Tip/paint-sync selection commit: drop last-good boxes for ids no longer in
 * the selected set so union seed floor / overlay reuse cannot see ghosts (565).
 */
export function shouldPruneTipRemountMemberLastHostRectsOnSelectionCommit(
  tipRemountChromeSessionLive: boolean,
  paintSyncHoldArmed: boolean,
): boolean {
  return tipRemountChromeSessionLive || paintSyncHoldArmed;
}

/**
 * Keep only selected-id last-good entries; returns how many keys were removed.
 */
export function pruneTipRemountMemberLastHostRectsToSelection(
  cache: Map<string, TipRemountHostPaintRect>,
  selectedIds: readonly string[],
): number {
  const keep = new Set(selectedIds);
  let removed = 0;
  for (const id of [...cache.keys()]) {
    if (!keep.has(id)) {
      cache.delete(id);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Overlay chrome paint when live measure is missing (553).
 * Shares last-good reuse with resolveTipRemountRefreshMissAction's
 * apply-last-good branch — overlays have no React "current" to retain.
 */
export function resolveTipRemountOverlayHostPaintRect(
  tipRemountChromeSessionLive: boolean,
  paintSyncHoldArmed: boolean,
  livePaint: TipRemountHostPaintRect | null,
  lastGood: TipRemountHostPaintRect | null,
): TipRemountHostPaintRect | null {
  if (livePaint && livePaint.width >= 1 && livePaint.height >= 1) {
    return livePaint;
  }
  if (shouldReuseLastHostRectOnTipRemountMeasureMiss(
    tipRemountChromeSessionLive,
    false,
    lastGood != null,
    paintSyncHoldArmed,
  )) {
    return lastGood;
  }
  return null;
}

/**
 * Single entry for overlay/chrome host paint (556): resolve live or last-good
 * and report whether the live paint should seed the tip last-good cache.
 */
export function resolveTipRemountHostPaintRectResult(
  tipRemountChromeSessionLive: boolean,
  paintSyncHoldArmed: boolean,
  livePaint: TipRemountHostPaintRect | null,
  lastGood: TipRemountHostPaintRect | null,
): {
  paint: TipRemountHostPaintRect | null;
  seedLastGood: TipRemountHostPaintRect | null;
} {
  const liveOk = Boolean(livePaint && livePaint.width >= 1 && livePaint.height >= 1);
  const paint = resolveTipRemountOverlayHostPaintRect(
    tipRemountChromeSessionLive,
    paintSyncHoldArmed,
    livePaint,
    lastGood,
  );
  return {
    paint,
    seedLastGood: liveOk && livePaint ? { ...livePaint } : null,
  };
}

/**
 * Refresh miss action after measure fails (549/550).
 * Order is intentional and must not reorder:
 *   1. apply-last-good — tip/paint-sync reuse (521/523), including last-good
 *      just seeded by selection commit (546)
 *   2. retain-current — tip session or paint-sync with a live box (538/546)
 *   3. keep-force — force remasure keeps optimistic seed (gesture/handoff)
 *   4. clear — non-tip unprotected miss
 */
export type TipRemountRefreshMissAction =
  | 'apply-last-good'
  | 'retain-current'
  | 'keep-force'
  | 'clear';

export function resolveTipRemountRefreshMissAction(
  tipRemountChromeSessionLive: boolean,
  paintSyncHoldArmed: boolean,
  hasLastGoodHostRect: boolean,
  hasCurrentHostPaint: boolean,
  force: boolean,
): TipRemountRefreshMissAction {
  if (shouldReuseLastHostRectOnTipRemountMeasureMiss(
    tipRemountChromeSessionLive,
    false,
    hasLastGoodHostRect,
    paintSyncHoldArmed,
  )) {
    return 'apply-last-good';
  }
  if (shouldRetainCurrentHostPaintOnTipRemountPaintMiss(
    paintSyncHoldArmed,
    false,
    hasCurrentHostPaint,
    tipRemountChromeSessionLive,
  )) {
    return 'retain-current';
  }
  if (force) return 'keep-force';
  return 'clear';
}

/**
 * Refresh-miss apply-last-good must resolve the same rect as overlay Result
 * when live paint is missing — one last-good source (559).
 */
export function tipRemountApplyLastGoodMatchesHostPaintResult(
  tipRemountChromeSessionLive: boolean,
  paintSyncHoldArmed: boolean,
  lastGood: TipRemountHostPaintRect | null,
): boolean {
  const action = resolveTipRemountRefreshMissAction(
    tipRemountChromeSessionLive,
    paintSyncHoldArmed,
    lastGood != null,
    false,
    false,
  );
  const { paint } = resolveTipRemountHostPaintRectResult(
    tipRemountChromeSessionLive,
    paintSyncHoldArmed,
    null,
    lastGood,
  );
  if (action === 'apply-last-good') {
    return Boolean(
      paint
      && lastGood
      && paint.x === lastGood.x
      && paint.y === lastGood.y
      && paint.width === lastGood.width
      && paint.height === lastGood.height,
    );
  }
  // Outside tip/paint-sync (or no last-good): both must leave paint empty.
  return paint == null;
}

/**
 * Drop tip-era last-good host rects once tip remount protect / follow is fully
 * idle — prevents stale boxes after settle (524).
 */
export function shouldClearTipRemountLastHostRectCache(
  tipRemountSessionLive: boolean,
  followWindowLive: boolean,
  tipPostProtectArmed: boolean,
): boolean {
  return !tipRemountSessionLive && !followWindowLive && !tipPostProtectArmed;
}

/**
 * During tip remount chrome session, prefer live/last-good host paint even when
 * it disagrees with composed target.rect — composed often lags fit/tip apply
 * and would otherwise flash the wrong box (526). Paint-sync hold covers the
 * inert→interactive frame (530).
 */
export function shouldTrustTipRemountHostPaintDespiteComposedStale(
  tipRemountChromeSessionLive: boolean,
  hostPaintOk: boolean,
  paintSyncHoldArmed = false,
): boolean {
  return (tipRemountChromeSessionLive || paintSyncHoldArmed) && hostPaintOk;
}

/**
 * Tip remount multi union: when only some members have host paint/last-good,
 * omit composed-only members so the union does not mix tip-era paint with
 * pre-tip composed boxes (529). Sibling retry (518) fills the rest.
 */
export function shouldOmitComposedMembersFromTipRemountPartialUnion(
  tipRemountChromeSessionLive: boolean,
  memberCount: number,
  paintBearingCount: number,
): boolean {
  return tipRemountChromeSessionLive
    && memberCount >= 2
    && paintBearingCount > 0
    && paintBearingCount < memberCount;
}

/**
 * While omitting composed-only members, latch the previous union envelope so
 * chrome does not shrink then grow when sibling paint arrives (532).
 */
export function shouldLatchTipRemountPartialUnionMinSize(
  omittingComposedMembers: boolean,
  previousUnionOk: boolean,
  nextUnionOk: boolean,
): boolean {
  return omittingComposedMembers && previousUnionOk && nextUnionOk;
}

/**
 * Expand next union to cover previous bounds — min-size latch against shrink (532).
 */
export function resolveTipRemountPartialUnionWithMinSizeLatch(
  previous: { x: number; y: number; width: number; height: number },
  next: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const left = Math.min(previous.x, next.x);
  const top = Math.min(previous.y, next.y);
  const right = Math.max(previous.x + previous.width, next.x + next.width);
  const bottom = Math.max(previous.y + previous.height, next.y + next.height);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Drop min-size latch when tip session ends, every member has paint, or no
 * member has paint (stale partial envelope must not stick) (535/541).
 */
export function shouldClearTipRemountPartialUnionMinSizeLatch(
  tipRemountChromeSessionLive: boolean,
  memberCount: number,
  paintBearingCount: number,
): boolean {
  if (!tipRemountChromeSessionLive) return true;
  if (memberCount >= 2 && paintBearingCount === 0) return true;
  return memberCount >= 2
    && paintBearingCount > 0
    && paintBearingCount >= memberCount;
}

/**
 * Stable fingerprint for tip remount multi membership — latch must not carry
 * across target-set changes (541).
 */
export function tipRemountPartialUnionLatchMemberKey(memberIds: readonly string[]): string {
  return [...memberIds]
    .map((id) => id.trim())
    .filter(Boolean)
    .sort()
    .join('\0');
}

export function shouldInvalidateTipRemountPartialUnionLatchOnMembershipChange(
  previousKey: string | null | undefined,
  nextKey: string,
): boolean {
  const prev = previousKey?.trim() ?? '';
  const next = nextKey.trim();
  if (!next) return Boolean(prev);
  return Boolean(prev) && prev !== next;
}

/**
 * Grace safety/expiry/consume still need paint-sync + unlock gate — bare
 * suppress drop flashes composed chrome (542). Selection/mode-exit keep a
 * clean sticky teardown instead.
 */
export function shouldReleaseTipRemountChromeViaPaintSyncOnGraceClear(
  reason: 'consume' | 'expiry' | 'safety' | 'selection' | 'mode-exit',
): boolean {
  return reason === 'consume' || reason === 'expiry' || reason === 'safety';
}

/**
 * Chrome just left tip-remount inert — hold host-paint trust for one paint sync
 * frame so interactive chrome does not flash composed (530).
 */
export function shouldArmTipRemountPaintSyncHold(
  wasChromeSuppressed: boolean,
  nowChromeSuppressed: boolean,
): boolean {
  return wasChromeSuppressed && !nowChromeSuppressed;
}

/** Paint-sync hold ends after double-rAF settle (530). */
export function clearTipRemountPaintSyncHold(): false {
  return false;
}

/**
 * Nested paint-sync rAF uses a generation token — cancel bumps the token so
 * in-flight outer/inner frames no-op even if only one id was cancelled (534).
 */
export function nextTipRemountPaintSyncHoldToken(previousToken: number): number {
  return previousToken + 1;
}

export function shouldApplyTipRemountPaintSyncHoldClear(
  scheduledToken: number,
  currentToken: number,
): boolean {
  return scheduledToken === currentToken;
}

/**
 * Defer multi geom-epoch bump while paint-sync hold is armed, or when this
 * remasure frame is about to arm it — paint refresh must win first (533).
 */
export function shouldDeferTipRemountGeomEpochBumpForPaintSync(
  paintSyncHoldArmed: boolean,
  chromeReleasePendingThisFrame: boolean,
): boolean {
  return paintSyncHoldArmed || chromeReleasePendingThisFrame;
}

/**
 * When paint-sync hold clears, flush any deferred geom-epoch bump (533).
 */
export function shouldFlushDeferredTipRemountGeomEpochAfterPaintSyncHold(
  paintSyncHoldClearing: boolean,
  deferredEpochBumpPending: boolean,
): boolean {
  return paintSyncHoldClearing && deferredEpochBumpPending;
}

/**
 * Canonical tip remount sequences for smoke pins (536/540).
 * After chrome-release, paint-sync and pointer-unlock run as **parallel tracks**
 * — geom-epoch-flush is tied to paint-sync clear, not to post-unlock quiet.
 */
export const TIP_REMOUNT_POST_PROTECT_SEQUENCE = [
  'sticky-clear',
  'soft-land',
  'exit-latch',
  'absorb',
  'post-absorb-quiet',
  'live',
] as const;

/** Shared prefix before paint / pointer tracks diverge (540). */
export const TIP_REMOUNT_CHROME_RELEASE_PREFIX = [
  'chrome-suppress',
  'fit-remasure',
  'chrome-release',
] as const;

/** Paint-sync track after chrome-release (540). */
export const TIP_REMOUNT_PAINT_SYNC_TRACK = [
  'paint-sync-hold',
  'geom-epoch-flush',
  'live',
] as const;

/** Pointer unlock track after chrome-release — parallel with paint track (540). */
export const TIP_REMOUNT_POINTER_UNLOCK_TRACK = [
  'unlock-pointer-gate',
  'pointerup-deferred-flush',
  'post-unlock-quiet',
  'live',
] as const;

/**
 * @deprecated Prefer TIP_REMOUNT_PAINT_SYNC_TRACK + TIP_REMOUNT_POINTER_UNLOCK_TRACK.
 * Concatenated view for older smoke pins — not a single causal chain after release.
 */
export const TIP_REMOUNT_CHROME_RELEASE_SEQUENCE = [
  ...TIP_REMOUNT_CHROME_RELEASE_PREFIX,
  'paint-sync-hold',
  'unlock-pointer-gate',
  'pointerup-deferred-flush',
  'post-unlock-quiet',
  'geom-epoch-flush',
  'live',
] as const;

/**
 * Multi tip remasure measured only some selected members — retry once so union
 * chrome does not keep a one-sided box (518).
 */
export function shouldRetryTipRemountSiblingMeasure(
  selectedCount: number,
  orderedCount: number,
  measuredCount: number,
): boolean {
  return selectedCount >= 2
    && orderedCount >= 2
    && measuredCount > 0
    && measuredCount < orderedCount;
}

/**
 * Fit remasure skipped mid-resize after chrome-release delay — remember to
 * release chrome when the gesture ends (489).
 */
export function shouldMarkTipRemountChromeReleasePendingAfterResizeSkip(
  resizeSessionActive: boolean,
  chromeSuppressed: boolean,
  remasureDelayMs: number,
  chromeReleaseDelayMs: number = TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
): boolean {
  return resizeSessionActive
    && chromeSuppressed
    && remasureDelayMs >= chromeReleaseDelayMs;
}

/**
 * Gesture ended after a skipped chrome-release remasure — drop inert (489).
 */
export function shouldReleaseTipRemountChromeAfterResizeGestureEnds(
  chromeSuppressed: boolean,
  chromeReleasePending: boolean,
  resizeSessionActive: boolean,
): boolean {
  return chromeSuppressed && chromeReleasePending && !resizeSessionActive;
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
 * After tip remasure, refresh host scale/offset + geom epoch so chrome compose
 * stays aligned — multi union and single late fit remasures (461/515).
 */
export function shouldRefreshHostMetricsAfterTipRemountMultiRemasure(
  selectedCount: number,
  appliedAny: boolean,
): boolean {
  return appliedAny && selectedCount >= 1;
}

/**
 * Multi tip remasure should bump geom epoch even when only siblings measured
 * (primary paint may be skipped) so union chrome re-syncs (515).
 */
export function shouldBumpGeomEpochAfterTipRemountMultiRemasure(
  selectedCount: number,
  appliedAny: boolean,
): boolean {
  return appliedAny && selectedCount >= 2;
}
