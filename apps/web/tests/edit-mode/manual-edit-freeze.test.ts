import { describe, expect, it } from 'vitest';
import {
  shouldClearManualEditFrozenSourceOnModeChange,
  shouldClearMixedKeysAfterTipYieldReseedSkip,
  shouldClearTipRemountGeometryGraceOnExpiry,
  shouldClearTipRemountGeometryGraceOnSelectionChange,
  shouldEchoManualEditSelectionAfterFreezeSync,
  shouldRequestTipRemountRemasureAfterFreezeSync,
  shouldRequestTipRemountRemasureAfterSrcDocLoad,
  shouldApplyTipRemountSyncHostMeasureOnSrcDocLoad,
  shouldRetryTipRemountSyncHostMeasureAfterSrcDocLoad,
  shouldCancelTipRemountSyncHostMeasureRetry,
  shouldReleaseTipRemountChromeAfterSyncHostMeasure,
  shouldReleaseTipRemountChromeAfterFitSettleRemasure,
  shouldReleaseTipRemountChromeAfterFailedFitSettleRemasure,
  TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
  TIP_REMOUNT_FIT_SETTLE_LAST_REMEASURE_MS,
  TIP_REMOUNT_FIT_SETTLE_LATCH_MS,
  TIP_REMOUNT_FIT_SETTLE_REMEASURE_DELAYS_MS,
  TIP_POST_STICKY_SOFT_LAND_CATALOGS,
  TIP_REMOUNT_DECK_NUDGE_FOLLOW_MS,
  shouldIgnoreOdEditTargetsMembershipNoiseDuringTipProtect,
  shouldClearManualEditSelectionOnEmptyOdEditTargets,
  shouldClearTipSyncedIdentityStickyRetainOnFullCatalog,
  shouldDeferTipSyncedIdentityStickyClearUntilAfterPreserve,
  shouldArmTipPostStickySoftLand,
  shouldRetainTipSyncedIdentityDuringPostStickySoftLand,
  consumeTipPostStickySoftLandCatalog,
  shouldEarlyExitTipPostStickySoftLand,
  shouldArmTipPostSoftLandExitLatch,
  shouldRetainTipSyncedIdentityDuringPostSoftLandExitLatch,
  clearTipPostSoftLandExitLatch,
  shouldLatchSelectedIdentityFingerprintDuringTipSoftLand,
  shouldArmTipPostExitLatchMixedAbsorb,
  shouldArmTipPostExitLatchMixedAbsorbOnSoftLandEarlyExit,
  shouldSkipOdEditTargetsIdentityMixedReseedDuringPostExitAbsorb,
  shouldAbsorbLiveIdentityFingerprintOnPostExitLatch,
  shouldSyncSelectedIdentityFingerprintOnSoftLandEarlyExit,
  shouldKeepMultiInspectorSourceOnlyDuringTipExitLatch,
  shouldSkipOdEditTargetsSingleInspectorReseedDuringPostExitAbsorb,
  shouldTreatPostExitAbsorbAsTipProtect,
  shouldSettleInspectorStylesOnPostExitAbsorb,
  shouldPreferPendingDraftOverAbsorbInspectorSettle,
  shouldRefreshHostMetricsBeforeTipRemountGeometryApply,
  shouldClearTipPostProtectOnSelectionChange,
  shouldClearTipRemountOnManualEditModeExit,
  tipRemountPostProtectArmed,
  nextTipRemountDeckNudgeFollowUntilMs,
  shouldRemeasureTipRemountOnDeckHostFitNudge,
  shouldThrottleTipRemountDeckNudgeRemasure,
  shouldCatchUpHostMetricsWhenDeckNudgeRemasureThrottled,
  shouldDeferTipRemountPostReleaseGeometryApply,
  shouldReplaceDeferredTipRemountGeometryPayload,
  shouldInvalidateDeferredTipRemountGeometryOnImmediateApply,
  shouldFlushDeferredTipRemountGeometryBeforeUnlockGateClear,
  shouldArmTipRemountPostUnlockQuiet,
  shouldSpendTipRemountPostUnlockQuiet,
  clearTipRemountPostUnlockQuiet,
  shouldForceSpendTipRemountPostUnlockQuiet,
  TIP_REMOUNT_POST_UNLOCK_QUIET_TIMEOUT_MS,
  shouldArmTipRemountChromeUnlockPointerGate,
  shouldDisableManualEditChromeForTipRemountUnlockGate,
  shouldReuseLastHostRectOnTipRemountMeasureMiss,
  shouldRetainCurrentHostPaintOnTipRemountPaintMiss,
  shouldSeedTipRemountLastHostRectFromLivePaint,
  shouldApplyTipRemountLastHostRectOnLayoutPaintMiss,
  hostPaintRectForManualEditSelectionCommit,
  shouldRefreshHostPaintOnManualEditSelectionCommit,
  resolveTipRemountOverlayHostPaintRect,
  resolveTipRemountHostPaintRectResult,
  shouldSeedTipRemountMemberLastHostRectsOnMultiCommit,
  shouldRetryTipRemountMemberLastHostRectSeed,
  shouldCancelTipRemountMemberLastHostRectSeedRetry,
  shouldApplyTipRemountMemberLastHostRectSeedRetry,
  expectedTipRemountUnionPaintBearingCount,
  tipRemountApplyLastGoodMatchesHostPaintResult,
  resolveTipRemountRefreshMissAction,
  shouldClearTipRemountLastHostRectCache,
  shouldTrustTipRemountHostPaintDespiteComposedStale,
  shouldOmitComposedMembersFromTipRemountPartialUnion,
  shouldLatchTipRemountPartialUnionMinSize,
  resolveTipRemountPartialUnionWithMinSizeLatch,
  shouldClearTipRemountPartialUnionMinSizeLatch,
  tipRemountPartialUnionLatchMemberKey,
  shouldInvalidateTipRemountPartialUnionLatchOnMembershipChange,
  shouldReleaseTipRemountChromeViaPaintSyncOnGraceClear,
  shouldArmTipRemountPaintSyncHold,
  clearTipRemountPaintSyncHold,
  nextTipRemountPaintSyncHoldToken,
  shouldApplyTipRemountPaintSyncHoldClear,
  shouldDeferTipRemountGeomEpochBumpForPaintSync,
  shouldFlushDeferredTipRemountGeomEpochAfterPaintSyncHold,
  TIP_REMOUNT_POST_PROTECT_SEQUENCE,
  TIP_REMOUNT_CHROME_RELEASE_SEQUENCE,
  TIP_REMOUNT_CHROME_RELEASE_PREFIX,
  TIP_REMOUNT_PAINT_SYNC_TRACK,
  TIP_REMOUNT_POINTER_UNLOCK_TRACK,
  shouldRetryTipRemountSiblingMeasure,
  TIP_REMOUNT_DECK_NUDGE_REMEASURE_THROTTLE_MS,
  shouldMarkTipRemountChromeReleasePendingAfterResizeSkip,
  shouldReleaseTipRemountChromeAfterResizeGestureEnds,
  shouldReleaseTipRemountChromeWhenDeckNudgeFollowEnds,
  shouldArmTipPostAbsorbInspectorQuiet,
  shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet,
  shouldTreatPostAbsorbQuietAsTipProtect,
  clearTipPostAbsorbInspectorQuiet,
  shouldClearTipPostProtectOnOdEditTargetsSelectionIdsChange,
  shouldDeferTipRemountChromeReleaseAfterFollowEndBlockedBySafety,
  shouldFlushDeferredTipRemountChromeReleaseAfterSafety,
  shouldSkipTipRemountFitSettleRemasureDuringResizeGesture,
  shouldArmPostTipFitSettleWildJumpSkip,
  shouldSkipWildJumpOnceAfterTipFitSettle,
  shouldConsumePostTipFitSettleWildJumpSkip,
  shouldArmTipRemountFitSettleForDeckHostFit,
  shouldRemeasureTipRemountAfterDeckHostFitSettle,
  shouldScheduleTipRemountFitSettleRemasureOnLoad,
  shouldDeferTipRemountGraceConsumeForDeckHostFitSettle,
  shouldSkipWildJumpDuringTipRemountFitSettle,
  shouldSkipWildJumpForTipRemountSelectedMember,
  shouldSkipWildJumpDuringTipRemountFitSettleForSelectedMember,
  shouldRefreshHostMetricsAfterTipRemountMultiRemasure,
  shouldBumpGeomEpochAfterTipRemountMultiRemasure,
  tipRemountSessionActive,
  shouldSkipOdEditTargetsIdentityMixedReseedDuringTipRemount,
  shouldAllowOdEditTargetsPendingReseedDuringTipProtect,
  withPreservedTipSyncedStylesOnBridgeTarget,
  resolveTipSyncedStylesForOdEditTargetsPreserve,
  withPreservedTipSyncedIdentityOnBridgeTarget,
  resolveTipSyncedTargetForOdEditTargetsPreserve,
  nextTipRemountIdentityHoldUntilMs,
  shouldArmTipRemountIdentityHoldOnGraceClear,
  shouldPreserveTipSyncedStylesOnOdEditTargets,
  shouldRetainTipSyncedIdentityAfterHold,
  shouldClearTipSyncedIdentityStickyRetainOnGraceClear,
  shouldClearTipSyncedIdentityStickyRetainOnFullCatalog,
  shouldDeferTipSyncedIdentityStickyClearUntilAfterPreserve,
  shouldReadSingleInspectorStylesFromSourceOnlyForOdEditTargets,
  tipRemountFitSettleExpired,
  shouldSkipSrcDocTransportRemountForManualEditFreezeTipSync,
  shouldSuppressManualEditChromeUntilTipRemasure,
  shouldDisableManualEditChromeUntilTipRemasure,
  shouldAbortManualEditGestureForTipYieldFreezeSync,
  shouldReleaseTipRemountChromeOnFailedRemasure,
  shouldPostHostChromeDuringTipRemountSuppress,
  shouldPatchSelectedGeometryFromTargetsBroadcast,
  shouldReseedManualEditMultiInspectorAfterFreezeSync,
  shouldReseedSingleInspectorAfterTipYieldMixedClear,
  shouldApplyTipYieldSingleInspectorSnapshot,
  shouldRefreshHostPaintAfterTipYieldSingleReseed,
  shouldRefreshHostPaintAfterTipRemountRemasure,
  shouldConsumeTipRemountGeometryGraceOnRemasure,
  shouldSyncSelectedTargetIdentityAfterTipYieldSingleReseed,
  shouldSyncSelectedTargetsIdentityAfterTipYieldMultiReseed,
  shouldSkipWildJumpAfterTipRemountGrace,
  shouldSyncManualEditFrozenSourceToPainted,
  shouldUpdateManualEditFrozenSourceOnPatch,
  tipRemountGeometryGraceExpired,
} from '../../src/edit-mode/manual-edit-freeze';

describe('manual edit freeze reset', () => {
  it('clears the entry freeze when leaving edit mode', () => {
    expect(shouldClearManualEditFrozenSourceOnModeChange(true, false)).toBe(true);
  });

  it('clears the entry freeze when re-entering so the next snapshot is fresh', () => {
    // Re-enter after a style save: previous freeze still holds pre-style HTML.
    // Clearing forces the freeze effect to capture the updated live source.
    expect(shouldClearManualEditFrozenSourceOnModeChange(false, true)).toBe(true);
  });

  it('does not clear when the mode value is unchanged', () => {
    expect(shouldClearManualEditFrozenSourceOnModeChange(true, true)).toBe(false);
    expect(shouldClearManualEditFrozenSourceOnModeChange(false, false)).toBe(false);
  });

  it('does not remount the freeze on set-style saves', () => {
    expect(shouldUpdateManualEditFrozenSourceOnPatch('set-style')).toBe(false);
    expect(shouldUpdateManualEditFrozenSourceOnPatch('set-text')).toBe(true);
    expect(shouldUpdateManualEditFrozenSourceOnPatch('set-outer-html')).toBe(true);
    expect(shouldUpdateManualEditFrozenSourceOnPatch('remove-element')).toBe(true);
  });

  it('syncs freeze to painted tip/external refresh while edit mode is on', () => {
    const frozen = '<html>old</html>';
    const tip = '<html>tip</html>';
    expect(shouldSyncManualEditFrozenSourceToPainted(true, frozen, tip)).toBe(true);
    expect(shouldSyncManualEditFrozenSourceToPainted(true, tip, tip)).toBe(false);
    expect(shouldSyncManualEditFrozenSourceToPainted(false, frozen, tip)).toBe(false);
    expect(shouldSyncManualEditFrozenSourceToPainted(true, null, tip)).toBe(false);
  });

  it('echoes selection after freeze tip-yield remount when ids remain', () => {
    expect(shouldEchoManualEditSelectionAfterFreezeSync(true, ['a'])).toBe(true);
    expect(shouldEchoManualEditSelectionAfterFreezeSync(true, ['a', 'b'])).toBe(true);
    expect(shouldEchoManualEditSelectionAfterFreezeSync(true, [])).toBe(false);
    expect(shouldEchoManualEditSelectionAfterFreezeSync(false, ['a'])).toBe(false);
  });

  it('reseeds multi Mixed after freeze tip-yield only when 2+ selected', () => {
    expect(shouldReseedManualEditMultiInspectorAfterFreezeSync(true, ['a', 'b'])).toBe(true);
    expect(shouldReseedManualEditMultiInspectorAfterFreezeSync(true, ['a'])).toBe(false);
    expect(shouldReseedManualEditMultiInspectorAfterFreezeSync(false, ['a', 'b'])).toBe(false);
  });

  it('skips wild-jump deny during tip-remount geometry grace', () => {
    expect(shouldSkipWildJumpAfterTipRemountGrace('el-1', 'el-1', 'el-1', 1_000, 1_800)).toBe(true);
    // Sibling multi-select remasure must not consume another element's grace.
    expect(shouldSkipWildJumpAfterTipRemountGrace('el-1', 'el-2', 'el-1', 1_000, 1_800)).toBe(false);
    expect(shouldSkipWildJumpAfterTipRemountGrace('el-1', 'el-1', 'el-2', 1_000, 1_800)).toBe(false);
    expect(shouldSkipWildJumpAfterTipRemountGrace('el-1', 'el-1', 'el-1', 2_000, 1_800)).toBe(false);
    expect(shouldSkipWildJumpAfterTipRemountGrace(null, 'el-1', 'el-1', 1_000, 1_800)).toBe(false);
    expect(shouldSkipWildJumpAfterTipRemountGrace('el-1', 'el-1', null, 1_000, 1_800)).toBe(false);
  });

  it('restores wild-jump deny after tip-remount geometry grace expires', () => {
    expect(tipRemountGeometryGraceExpired(1_000, 1_800)).toBe(false);
    expect(tipRemountGeometryGraceExpired(1_800, 1_800)).toBe(true);
    expect(tipRemountGeometryGraceExpired(1_801, 1_800)).toBe(true);
    // Expired window must not skip wild-jump even when ids still match.
    expect(shouldSkipWildJumpAfterTipRemountGrace('el-1', 'el-1', 'el-1', 1_800, 1_800)).toBe(false);
  });

  it('clears Mixed when deferred tip-yield reseed skips after 2→1', () => {
    expect(shouldClearMixedKeysAfterTipYieldReseedSkip(['a'])).toBe(true);
    expect(shouldClearMixedKeysAfterTipYieldReseedSkip([])).toBe(true);
    expect(shouldClearMixedKeysAfterTipYieldReseedSkip(['a', 'b'])).toBe(false);
    expect(shouldReseedManualEditMultiInspectorAfterFreezeSync(true, ['a'])).toBe(false);
  });

  it('requests tip-remount remasure after freeze selection echo', () => {
    expect(shouldRequestTipRemountRemasureAfterFreezeSync(true, ['a'])).toBe(true);
    expect(shouldRequestTipRemountRemasureAfterFreezeSync(true, ['a', 'b'])).toBe(true);
    expect(shouldRequestTipRemountRemasureAfterFreezeSync(true, [])).toBe(false);
    expect(shouldRequestTipRemountRemasureAfterFreezeSync(false, ['a'])).toBe(false);
  });

  it('requests tip-remount remasure from srcDoc onLoad while grace is armed', () => {
    expect(shouldRequestTipRemountRemasureAfterSrcDocLoad(true, ['a'], 'a')).toBe(true);
    expect(shouldRequestTipRemountRemasureAfterSrcDocLoad(true, ['a', 'b'], 'a')).toBe(true);
    expect(shouldRequestTipRemountRemasureAfterSrcDocLoad(true, ['a'], null)).toBe(false);
    expect(shouldRequestTipRemountRemasureAfterSrcDocLoad(false, ['a'], 'a')).toBe(false);
  });

  it('applies sync host measure on tip srcDoc onLoad while grace is armed', () => {
    expect(shouldApplyTipRemountSyncHostMeasureOnSrcDocLoad(true, ['a'], 'a')).toBe(true);
    expect(shouldApplyTipRemountSyncHostMeasureOnSrcDocLoad(true, ['a', 'b'], 'a')).toBe(true);
    expect(shouldApplyTipRemountSyncHostMeasureOnSrcDocLoad(true, ['a'], null)).toBe(false);
    expect(shouldApplyTipRemountSyncHostMeasureOnSrcDocLoad(false, ['a'], 'a')).toBe(false);
  });

  it('releases tip-remount chrome inert after sync primary measure', () => {
    expect(shouldReleaseTipRemountChromeAfterSyncHostMeasure(true)).toBe(true);
    expect(shouldReleaseTipRemountChromeAfterSyncHostMeasure(false)).toBe(false);
    expect(shouldReleaseTipRemountChromeAfterSyncHostMeasure(true, 2_000, 1_000)).toBe(false);
    expect(shouldReleaseTipRemountChromeAfterSyncHostMeasure(true, 2_000, 2_000)).toBe(true);
    expect(shouldReleaseTipRemountChromeAfterFitSettleRemasure(
      true, true, TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
    )).toBe(true);
    expect(shouldReleaseTipRemountChromeAfterFitSettleRemasure(true, true, 150)).toBe(false);
    expect(shouldReleaseTipRemountChromeAfterFitSettleRemasure(true, false, 400)).toBe(false);
    expect(shouldReleaseTipRemountChromeAfterFitSettleRemasure(false, true, 400)).toBe(false);
    expect(shouldReleaseTipRemountChromeAfterFailedFitSettleRemasure(true, false, 400)).toBe(true);
    expect(shouldReleaseTipRemountChromeAfterFailedFitSettleRemasure(true, true, 400)).toBe(false);
    expect(shouldReleaseTipRemountChromeAfterFailedFitSettleRemasure(true, false, 150)).toBe(false);
    expect(shouldReleaseTipRemountChromeAfterFailedFitSettleRemasure(false, false, 400)).toBe(false);
    // 900/1600ms remasure updates geometry but must not re-gate chrome release (478/481).
    expect(shouldReleaseTipRemountChromeAfterFitSettleRemasure(
      false, true, 900, TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
    )).toBe(false);
    expect(shouldReleaseTipRemountChromeAfterFitSettleRemasure(
      false, true, 1600, TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
    )).toBe(false);
    expect(TIP_REMOUNT_FIT_SETTLE_REMEASURE_DELAYS_MS).toEqual([50, 150, 400, 900, 1600]);
    expect(TIP_REMOUNT_FIT_SETTLE_REMEASURE_DELAYS_MS).toContain(1600);
    expect(TIP_REMOUNT_FIT_SETTLE_LATCH_MS).toBeGreaterThanOrEqual(
      Math.max(...TIP_REMOUNT_FIT_SETTLE_REMEASURE_DELAYS_MS),
    );
    expect(shouldSkipTipRemountFitSettleRemasureDuringResizeGesture(true)).toBe(true);
    expect(shouldSkipTipRemountFitSettleRemasureDuringResizeGesture(false)).toBe(false);
    expect(shouldArmTipPostStickySoftLand(true)).toBe(true);
    expect(shouldArmTipPostStickySoftLand(false)).toBe(false);
    expect(TIP_POST_STICKY_SOFT_LAND_CATALOGS).toBeGreaterThanOrEqual(1);
    expect(shouldRetainTipSyncedIdentityDuringPostStickySoftLand(2, false)).toBe(true);
    expect(shouldRetainTipSyncedIdentityDuringPostStickySoftLand(0, false)).toBe(false);
    expect(shouldRetainTipSyncedIdentityDuringPostStickySoftLand(2, true)).toBe(false);
    expect(consumeTipPostStickySoftLandCatalog(2, false)).toBe(1);
    expect(consumeTipPostStickySoftLandCatalog(1, false)).toBe(0);
    expect(consumeTipPostStickySoftLandCatalog(2, true)).toBe(0);
    expect(shouldEarlyExitTipPostStickySoftLand(2, false, 'same', 'same')).toBe(true);
    expect(shouldEarlyExitTipPostStickySoftLand(2, false, 'a', 'b')).toBe(false);
    expect(shouldEarlyExitTipPostStickySoftLand(0, false, 'same', 'same')).toBe(false);
    expect(shouldArmTipPostSoftLandExitLatch(1, 0, false, false)).toBe(true);
    expect(shouldArmTipPostSoftLandExitLatch(1, 0, false, true)).toBe(false);
    expect(shouldArmTipPostSoftLandExitLatch(2, 1, false, false)).toBe(false);
    expect(shouldRetainTipSyncedIdentityDuringPostSoftLandExitLatch(true, false)).toBe(true);
    expect(shouldRetainTipSyncedIdentityDuringPostSoftLandExitLatch(true, true)).toBe(false);
    expect(clearTipPostSoftLandExitLatch()).toBe(false);
    expect(shouldLatchSelectedIdentityFingerprintDuringTipSoftLand(true, false)).toBe(true);
    expect(shouldLatchSelectedIdentityFingerprintDuringTipSoftLand(true, true)).toBe(false);
    expect(shouldArmTipPostExitLatchMixedAbsorb(true, false)).toBe(true);
    expect(shouldArmTipPostExitLatchMixedAbsorb(true, true)).toBe(false);
    expect(shouldArmTipPostExitLatchMixedAbsorbOnSoftLandEarlyExit(true, false)).toBe(true);
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringPostExitAbsorb(false, true)).toBe(true);
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringPostExitAbsorb(false, true, true)).toBe(false);
    expect(shouldAbsorbLiveIdentityFingerprintOnPostExitLatch(true, false)).toBe(true);
    expect(shouldSyncSelectedIdentityFingerprintOnSoftLandEarlyExit(true, false)).toBe(true);
    expect(shouldKeepMultiInspectorSourceOnlyDuringTipExitLatch(true, 2)).toBe(true);
    expect(shouldKeepMultiInspectorSourceOnlyDuringTipExitLatch(true, 1)).toBe(false);
    expect(shouldSkipOdEditTargetsSingleInspectorReseedDuringPostExitAbsorb(false, true)).toBe(true);
    expect(shouldSkipOdEditTargetsSingleInspectorReseedDuringPostExitAbsorb(false, true, true)).toBe(false);
    expect(shouldTreatPostExitAbsorbAsTipProtect(true)).toBe(true);
    expect(shouldTreatPostExitAbsorbAsTipProtect(false)).toBe(false);
    expect(shouldSettleInspectorStylesOnPostExitAbsorb(true, false)).toBe(true);
    expect(shouldSettleInspectorStylesOnPostExitAbsorb(true, false, true)).toBe(false);
    expect(shouldSettleInspectorStylesOnPostExitAbsorb(true, true)).toBe(false);
    expect(shouldSettleInspectorStylesOnPostExitAbsorb(false, false)).toBe(false);
    expect(shouldPreferPendingDraftOverAbsorbInspectorSettle(true, true)).toBe(true);
    expect(shouldPreferPendingDraftOverAbsorbInspectorSettle(false, true)).toBe(false);
    expect(shouldPreferPendingDraftOverAbsorbInspectorSettle(true, false)).toBe(false);
    expect(shouldRefreshHostMetricsBeforeTipRemountGeometryApply(true, false, 900)).toBe(true);
    expect(shouldRefreshHostMetricsBeforeTipRemountGeometryApply(true, true, 400)).toBe(true);
    expect(shouldRefreshHostMetricsBeforeTipRemountGeometryApply(true, true, 150)).toBe(false);
    expect(shouldRefreshHostMetricsBeforeTipRemountGeometryApply(false, false, 900)).toBe(false);
    expect(shouldArmTipPostAbsorbInspectorQuiet(true, false)).toBe(true);
    expect(shouldArmTipPostAbsorbInspectorQuiet(true, true)).toBe(false);
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet(false, true)).toBe(true);
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet(false, true, true)).toBe(false);
    expect(shouldTreatPostAbsorbQuietAsTipProtect(true)).toBe(true);
    expect(clearTipPostAbsorbInspectorQuiet()).toBe(false);
    expect(shouldClearTipPostProtectOnOdEditTargetsSelectionIdsChange(true)).toBe(true);
    expect(shouldClearTipPostProtectOnOdEditTargetsSelectionIdsChange(false)).toBe(false);
    expect(shouldClearTipPostProtectOnSelectionChange('a', 'b')).toBe(true);
    expect(shouldClearTipPostProtectOnSelectionChange('a', null)).toBe(true);
    expect(shouldClearTipPostProtectOnSelectionChange('a', 'a')).toBe(false);
    expect(shouldClearTipPostProtectOnSelectionChange(null, null)).toBe(false);
    expect(shouldClearTipRemountOnManualEditModeExit(false, false)).toBe(false);
    expect(shouldClearTipRemountOnManualEditModeExit(false, true)).toBe(true);
    expect(shouldClearTipRemountOnManualEditModeExit(true, true)).toBe(false);
    expect(tipRemountPostProtectArmed({})).toBe(false);
    expect(tipRemountPostProtectArmed({ absorb: true, softLandRemaining: 0 })).toBe(true);
    expect(tipRemountPostProtectArmed({ postAbsorbQuiet: true })).toBe(true);
    expect(tipRemountPostProtectArmed({ followUntilMs: 1 })).toBe(true);
    expect(shouldThrottleTipRemountDeckNudgeRemasure(1_000, 1_050)).toBe(true);
    expect(shouldThrottleTipRemountDeckNudgeRemasure(1_000, 1_200)).toBe(false);
    expect(shouldThrottleTipRemountDeckNudgeRemasure(0, 1_050)).toBe(false);
    expect(TIP_REMOUNT_DECK_NUDGE_REMEASURE_THROTTLE_MS).toBe(100);
    expect(shouldCatchUpHostMetricsWhenDeckNudgeRemasureThrottled(true, true, true, false)).toBe(true);
    expect(shouldCatchUpHostMetricsWhenDeckNudgeRemasureThrottled(true, true, true, true)).toBe(false);
    expect(shouldCatchUpHostMetricsWhenDeckNudgeRemasureThrottled(true, false, true, false)).toBe(false);
    expect(shouldDeferTipRemountPostReleaseGeometryApply(false, 900, true)).toBe(true);
    expect(shouldDeferTipRemountPostReleaseGeometryApply(false, 900, false)).toBe(false);
    expect(shouldDeferTipRemountPostReleaseGeometryApply(true, 900, true)).toBe(false);
    expect(shouldDeferTipRemountPostReleaseGeometryApply(false, 150, true)).toBe(false);
    expect(shouldDeferTipRemountPostReleaseGeometryApply(false, 900, false, undefined, true)).toBe(true);
    expect(shouldDeferTipRemountPostReleaseGeometryApply(false, 900, true, undefined, false, true)).toBe(false);
    expect(shouldReplaceDeferredTipRemountGeometryPayload(true, true)).toBe(true);
    expect(shouldReplaceDeferredTipRemountGeometryPayload(true, false)).toBe(false);
    expect(shouldInvalidateDeferredTipRemountGeometryOnImmediateApply(true, true)).toBe(true);
    expect(shouldInvalidateDeferredTipRemountGeometryOnImmediateApply(false, true)).toBe(false);
    expect(shouldFlushDeferredTipRemountGeometryBeforeUnlockGateClear(true, true)).toBe(true);
    expect(shouldFlushDeferredTipRemountGeometryBeforeUnlockGateClear(true, false)).toBe(false);
    expect(shouldFlushDeferredTipRemountGeometryBeforeUnlockGateClear(false, true)).toBe(false);
    expect(shouldArmTipRemountPostUnlockQuiet(true)).toBe(true);
    expect(shouldArmTipRemountPostUnlockQuiet(false)).toBe(false);
    expect(shouldSpendTipRemountPostUnlockQuiet(true, true)).toBe(true);
    expect(shouldSpendTipRemountPostUnlockQuiet(true, false)).toBe(false);
    expect(clearTipRemountPostUnlockQuiet()).toBe(false);
    expect(shouldForceSpendTipRemountPostUnlockQuiet(true, true, false)).toBe(true);
    expect(shouldForceSpendTipRemountPostUnlockQuiet(true, false, true)).toBe(true);
    expect(shouldForceSpendTipRemountPostUnlockQuiet(true, false, false)).toBe(false);
    expect(shouldForceSpendTipRemountPostUnlockQuiet(false, true, true)).toBe(false);
    expect(TIP_REMOUNT_POST_UNLOCK_QUIET_TIMEOUT_MS).toBe(2_000);
    expect(shouldArmTipRemountChromeUnlockPointerGate(true, false, true)).toBe(true);
    expect(shouldArmTipRemountChromeUnlockPointerGate(true, false, false)).toBe(false);
    expect(shouldArmTipRemountChromeUnlockPointerGate(true, false, false, true)).toBe(true);
    expect(shouldArmTipRemountChromeUnlockPointerGate(false, false, true)).toBe(false);
    expect(shouldArmTipRemountChromeUnlockPointerGate(true, false, true, false, true)).toBe(false);
    expect(shouldDisableManualEditChromeForTipRemountUnlockGate(false, true)).toBe(true);
    expect(shouldDisableManualEditChromeForTipRemountUnlockGate(false, false)).toBe(false);
    expect(shouldReuseLastHostRectOnTipRemountMeasureMiss(true, false, true)).toBe(true);
    expect(shouldReuseLastHostRectOnTipRemountMeasureMiss(true, true, true)).toBe(false);
    expect(shouldReuseLastHostRectOnTipRemountMeasureMiss(false, false, true)).toBe(false);
    expect(shouldReuseLastHostRectOnTipRemountMeasureMiss(false, false, true, true)).toBe(true);
    expect(shouldRetainCurrentHostPaintOnTipRemountPaintMiss(true, false, true)).toBe(true);
    expect(shouldRetainCurrentHostPaintOnTipRemountPaintMiss(true, true, true)).toBe(false);
    expect(shouldRetainCurrentHostPaintOnTipRemountPaintMiss(false, false, true)).toBe(false);
    expect(shouldRetainCurrentHostPaintOnTipRemountPaintMiss(false, false, true, true)).toBe(true);
    expect(shouldRetainCurrentHostPaintOnTipRemountPaintMiss(false, false, false, true)).toBe(false);
    expect(shouldSeedTipRemountLastHostRectFromLivePaint(true, false, true)).toBe(true);
    expect(shouldSeedTipRemountLastHostRectFromLivePaint(false, true, true)).toBe(true);
    expect(shouldSeedTipRemountLastHostRectFromLivePaint(false, false, true)).toBe(false);
    expect(shouldApplyTipRemountLastHostRectOnLayoutPaintMiss(
      true, false, false, false, true,
    )).toBe(true);
    expect(shouldApplyTipRemountLastHostRectOnLayoutPaintMiss(
      false, true, false, false, true,
    )).toBe(true);
    expect(shouldApplyTipRemountLastHostRectOnLayoutPaintMiss(
      true, false, false, true, true,
    )).toBe(false);
    expect(shouldApplyTipRemountLastHostRectOnLayoutPaintMiss(
      false, false, false, false, true,
    )).toBe(false);
    expect(hostPaintRectForManualEditSelectionCommit(
      false, false, { x: 1, y: 2, width: 3, height: 4 },
    )).toBeNull();
    expect(hostPaintRectForManualEditSelectionCommit(
      true, false, { x: 1, y: 2, width: 3, height: 4 },
    )).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(hostPaintRectForManualEditSelectionCommit(
      false, true, { x: 1, y: 2, width: 3, height: 4 },
    )).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(hostPaintRectForManualEditSelectionCommit(true, false, null)).toBeNull();
    expect(resolveTipRemountRefreshMissAction(true, false, true, false, false))
      .toBe('apply-last-good');
    expect(resolveTipRemountRefreshMissAction(true, false, false, true, false))
      .toBe('retain-current');
    expect(resolveTipRemountRefreshMissAction(false, true, false, true, false))
      .toBe('retain-current');
    expect(resolveTipRemountRefreshMissAction(false, false, false, true, true))
      .toBe('keep-force');
    expect(resolveTipRemountRefreshMissAction(false, false, false, false, false))
      .toBe('clear');
    // Selection-commit last-good then refresh miss → same apply-last-good (549/550)
    expect(hostPaintRectForManualEditSelectionCommit(
      true, false, { x: 1, y: 2, width: 3, height: 4 },
    )).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(resolveTipRemountRefreshMissAction(true, false, true, true, true))
      .toBe('apply-last-good');
    expect(shouldRefreshHostPaintOnManualEditSelectionCommit(1, false, false)).toBe(true);
    expect(shouldRefreshHostPaintOnManualEditSelectionCommit(2, false, false)).toBe(false);
    expect(shouldRefreshHostPaintOnManualEditSelectionCommit(2, true, false)).toBe(true);
    expect(shouldRefreshHostPaintOnManualEditSelectionCommit(3, false, true)).toBe(true);
    expect(shouldSeedTipRemountMemberLastHostRectsOnMultiCommit(2, true, false)).toBe(true);
    expect(shouldSeedTipRemountMemberLastHostRectsOnMultiCommit(2, false, false)).toBe(false);
    expect(shouldSeedTipRemountMemberLastHostRectsOnMultiCommit(1, true, false)).toBe(false);
    expect(shouldRetryTipRemountMemberLastHostRectSeed(2, 0, true, false, false)).toBe(true);
    expect(shouldRetryTipRemountMemberLastHostRectSeed(2, 2, true, false, false)).toBe(false);
    expect(shouldRetryTipRemountMemberLastHostRectSeed(2, 1, true, false, true)).toBe(false);
    expect(shouldRetryTipRemountMemberLastHostRectSeed(2, 0, false, false, false)).toBe(false);
    expect(shouldCancelTipRemountMemberLastHostRectSeedRetry(true)).toBe(true);
    expect(shouldCancelTipRemountMemberLastHostRectSeedRetry(false)).toBe(false);
    expect(shouldApplyTipRemountMemberLastHostRectSeedRetry(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(shouldApplyTipRemountMemberLastHostRectSeedRetry(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(shouldApplyTipRemountMemberLastHostRectSeedRetry(['a'], ['a', 'b'])).toBe(false);
    expect(expectedTipRemountUnionPaintBearingCount(true, false, 3, 2, 1)).toBe(2);
    expect(expectedTipRemountUnionPaintBearingCount(false, true, 3, 3, 0)).toBe(3);
    expect(expectedTipRemountUnionPaintBearingCount(false, false, 3, 2, 1)).toBe(1);
    expect(expectedTipRemountUnionPaintBearingCount(true, false, 2, 5, 1)).toBe(2);
    expect(resolveTipRemountOverlayHostPaintRect(
      true, false, null, { x: 1, y: 2, width: 3, height: 4 },
    )).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(resolveTipRemountOverlayHostPaintRect(
      false, false, null, { x: 1, y: 2, width: 3, height: 4 },
    )).toBeNull();
    expect(resolveTipRemountOverlayHostPaintRect(
      true, false, { x: 9, y: 8, width: 7, height: 6 }, { x: 1, y: 2, width: 3, height: 4 },
    )).toEqual({ x: 9, y: 8, width: 7, height: 6 });
    expect(resolveTipRemountHostPaintRectResult(
      true, false, { x: 9, y: 8, width: 7, height: 6 }, { x: 1, y: 2, width: 3, height: 4 },
    )).toEqual({
      paint: { x: 9, y: 8, width: 7, height: 6 },
      seedLastGood: { x: 9, y: 8, width: 7, height: 6 },
    });
    expect(resolveTipRemountHostPaintRectResult(
      true, false, null, { x: 1, y: 2, width: 3, height: 4 },
    )).toEqual({
      paint: { x: 1, y: 2, width: 3, height: 4 },
      seedLastGood: null,
    });
    // Overlay last-good path matches refresh-miss apply-last-good (553/559)
    expect(resolveTipRemountRefreshMissAction(true, false, true, false, false))
      .toBe('apply-last-good');
    expect(tipRemountApplyLastGoodMatchesHostPaintResult(
      true, false, { x: 1, y: 2, width: 3, height: 4 },
    )).toBe(true);
    expect(tipRemountApplyLastGoodMatchesHostPaintResult(false, false, {
      x: 1, y: 2, width: 3, height: 4,
    })).toBe(true);
    expect(shouldClearTipRemountLastHostRectCache(false, false, false)).toBe(true);
    expect(shouldClearTipRemountLastHostRectCache(true, false, false)).toBe(false);
    expect(shouldClearTipRemountLastHostRectCache(false, true, false)).toBe(false);
    expect(shouldClearTipRemountLastHostRectCache(false, false, true)).toBe(false);
    expect(shouldTrustTipRemountHostPaintDespiteComposedStale(true, true)).toBe(true);
    expect(shouldTrustTipRemountHostPaintDespiteComposedStale(true, false)).toBe(false);
    expect(shouldTrustTipRemountHostPaintDespiteComposedStale(false, true)).toBe(false);
    expect(shouldTrustTipRemountHostPaintDespiteComposedStale(false, true, true)).toBe(true);
    expect(shouldOmitComposedMembersFromTipRemountPartialUnion(true, 3, 1)).toBe(true);
    expect(shouldOmitComposedMembersFromTipRemountPartialUnion(true, 3, 3)).toBe(false);
    expect(shouldOmitComposedMembersFromTipRemountPartialUnion(true, 3, 0)).toBe(false);
    expect(shouldOmitComposedMembersFromTipRemountPartialUnion(false, 3, 1)).toBe(false);
    expect(shouldLatchTipRemountPartialUnionMinSize(true, true, true)).toBe(true);
    expect(shouldLatchTipRemountPartialUnionMinSize(true, false, true)).toBe(false);
    expect(shouldLatchTipRemountPartialUnionMinSize(false, true, true)).toBe(false);
    expect(resolveTipRemountPartialUnionWithMinSizeLatch(
      { x: 0, y: 0, width: 100, height: 80 },
      { x: 10, y: 10, width: 40, height: 30 },
    )).toEqual({ x: 0, y: 0, width: 100, height: 80 });
    expect(shouldClearTipRemountPartialUnionMinSizeLatch(false, 3, 1)).toBe(true);
    expect(shouldClearTipRemountPartialUnionMinSizeLatch(true, 3, 3)).toBe(true);
    expect(shouldClearTipRemountPartialUnionMinSizeLatch(true, 3, 1)).toBe(false);
    expect(shouldClearTipRemountPartialUnionMinSizeLatch(true, 3, 0)).toBe(true);
    expect(tipRemountPartialUnionLatchMemberKey(['b', 'a'])).toBe(
      tipRemountPartialUnionLatchMemberKey(['a', 'b']),
    );
    expect(shouldInvalidateTipRemountPartialUnionLatchOnMembershipChange(
      tipRemountPartialUnionLatchMemberKey(['a', 'b']),
      tipRemountPartialUnionLatchMemberKey(['a', 'c']),
    )).toBe(true);
    expect(shouldInvalidateTipRemountPartialUnionLatchOnMembershipChange(
      tipRemountPartialUnionLatchMemberKey(['a', 'b']),
      tipRemountPartialUnionLatchMemberKey(['b', 'a']),
    )).toBe(false);
    expect(shouldReleaseTipRemountChromeViaPaintSyncOnGraceClear('safety')).toBe(true);
    expect(shouldReleaseTipRemountChromeViaPaintSyncOnGraceClear('expiry')).toBe(true);
    expect(shouldReleaseTipRemountChromeViaPaintSyncOnGraceClear('consume')).toBe(true);
    expect(shouldReleaseTipRemountChromeViaPaintSyncOnGraceClear('selection')).toBe(false);
    expect(shouldReleaseTipRemountChromeViaPaintSyncOnGraceClear('mode-exit')).toBe(false);
    expect(shouldArmTipRemountPaintSyncHold(true, false)).toBe(true);
    expect(shouldArmTipRemountPaintSyncHold(false, false)).toBe(false);
    expect(clearTipRemountPaintSyncHold()).toBe(false);
    expect(nextTipRemountPaintSyncHoldToken(0)).toBe(1);
    expect(nextTipRemountPaintSyncHoldToken(7)).toBe(8);
    expect(shouldApplyTipRemountPaintSyncHoldClear(3, 3)).toBe(true);
    expect(shouldApplyTipRemountPaintSyncHoldClear(3, 4)).toBe(false);
    expect(shouldDeferTipRemountGeomEpochBumpForPaintSync(true, false)).toBe(true);
    expect(shouldDeferTipRemountGeomEpochBumpForPaintSync(false, true)).toBe(true);
    expect(shouldDeferTipRemountGeomEpochBumpForPaintSync(false, false)).toBe(false);
    expect(shouldFlushDeferredTipRemountGeomEpochAfterPaintSyncHold(true, true)).toBe(true);
    expect(shouldFlushDeferredTipRemountGeomEpochAfterPaintSyncHold(true, false)).toBe(false);
    expect(shouldFlushDeferredTipRemountGeomEpochAfterPaintSyncHold(false, true)).toBe(false);
    expect([...TIP_REMOUNT_POST_PROTECT_SEQUENCE]).toEqual([
      'sticky-clear',
      'soft-land',
      'exit-latch',
      'absorb',
      'post-absorb-quiet',
      'live',
    ]);
    expect([...TIP_REMOUNT_CHROME_RELEASE_PREFIX]).toEqual([
      'chrome-suppress',
      'fit-remasure',
      'chrome-release',
    ]);
    expect([...TIP_REMOUNT_PAINT_SYNC_TRACK]).toEqual([
      'paint-sync-hold',
      'geom-epoch-flush',
      'live',
    ]);
    expect([...TIP_REMOUNT_POINTER_UNLOCK_TRACK]).toEqual([
      'unlock-pointer-gate',
      'pointerup-deferred-flush',
      'post-unlock-quiet',
      'live',
    ]);
    expect([...TIP_REMOUNT_CHROME_RELEASE_SEQUENCE]).toEqual([
      'chrome-suppress',
      'fit-remasure',
      'chrome-release',
      'paint-sync-hold',
      'unlock-pointer-gate',
      'pointerup-deferred-flush',
      'post-unlock-quiet',
      'geom-epoch-flush',
      'live',
    ]);
    expect(TIP_REMOUNT_PAINT_SYNC_TRACK.indexOf('paint-sync-hold')).toBeLessThan(
      TIP_REMOUNT_PAINT_SYNC_TRACK.indexOf('geom-epoch-flush'),
    );
    expect(TIP_REMOUNT_POINTER_UNLOCK_TRACK.indexOf('pointerup-deferred-flush')).toBeLessThan(
      TIP_REMOUNT_POINTER_UNLOCK_TRACK.indexOf('post-unlock-quiet'),
    );
    expect(shouldRetryTipRemountSiblingMeasure(2, 2, 1)).toBe(true);
    expect(shouldRetryTipRemountSiblingMeasure(2, 2, 2)).toBe(false);
    expect(shouldRetryTipRemountSiblingMeasure(1, 1, 0)).toBe(false);
    expect(shouldRetryTipRemountSiblingMeasure(2, 2, 0)).toBe(false);
    expect(shouldReleaseTipRemountChromeWhenDeckNudgeFollowEnds(true, true)).toBe(true);
    expect(shouldReleaseTipRemountChromeWhenDeckNudgeFollowEnds(true, true, true)).toBe(false);
    expect(shouldReleaseTipRemountChromeWhenDeckNudgeFollowEnds(true, false)).toBe(false);
    expect(shouldReleaseTipRemountChromeWhenDeckNudgeFollowEnds(false, true)).toBe(false);
    expect(shouldDeferTipRemountChromeReleaseAfterFollowEndBlockedBySafety(true, true, true)).toBe(true);
    expect(shouldDeferTipRemountChromeReleaseAfterFollowEndBlockedBySafety(true, true, false)).toBe(false);
    expect(shouldFlushDeferredTipRemountChromeReleaseAfterSafety(true, true, false)).toBe(true);
    expect(shouldFlushDeferredTipRemountChromeReleaseAfterSafety(true, true, true)).toBe(false);
    expect(shouldFlushDeferredTipRemountChromeReleaseAfterSafety(false, true, false)).toBe(false);
    expect(nextTipRemountDeckNudgeFollowUntilMs(1_000, true)).toBe(
      1_000 + TIP_REMOUNT_DECK_NUDGE_FOLLOW_MS,
    );
    expect(nextTipRemountDeckNudgeFollowUntilMs(1_000, false)).toBe(0);
    expect(shouldRemeasureTipRemountOnDeckHostFitNudge(true, ['a'], 2_000, 1_500)).toBe(true);
    expect(shouldRemeasureTipRemountOnDeckHostFitNudge(true, ['a'], 2_000, 2_000)).toBe(false);
    expect(shouldRemeasureTipRemountOnDeckHostFitNudge(false, ['a'], 2_000, 1_500)).toBe(false);
    expect(shouldMarkTipRemountChromeReleasePendingAfterResizeSkip(true, true, 400)).toBe(true);
    expect(shouldMarkTipRemountChromeReleasePendingAfterResizeSkip(true, true, 150)).toBe(false);
    expect(shouldMarkTipRemountChromeReleasePendingAfterResizeSkip(false, true, 400)).toBe(false);
    expect(shouldReleaseTipRemountChromeAfterResizeGestureEnds(true, true, false)).toBe(true);
    expect(shouldReleaseTipRemountChromeAfterResizeGestureEnds(true, true, true)).toBe(false);
    expect(shouldReleaseTipRemountChromeAfterResizeGestureEnds(true, false, false)).toBe(false);
    expect(shouldArmPostTipFitSettleWildJumpSkip(true, 1)).toBe(true);
    expect(shouldArmPostTipFitSettleWildJumpSkip(false, 1)).toBe(false);
    expect(shouldArmPostTipFitSettleWildJumpSkip(true, 0)).toBe(false);
    expect(shouldSkipWildJumpOnceAfterTipFitSettle(true, 'a', ['a', 'b'])).toBe(true);
    expect(shouldSkipWildJumpOnceAfterTipFitSettle(true, 'c', ['a', 'b'])).toBe(false);
    expect(shouldSkipWildJumpOnceAfterTipFitSettle(false, 'a', ['a'])).toBe(false);
    expect(shouldConsumePostTipFitSettleWildJumpSkip(true, true)).toBe(true);
    expect(shouldConsumePostTipFitSettleWildJumpSkip(true, false)).toBe(false);
    expect(shouldIgnoreOdEditTargetsMembershipNoiseDuringTipProtect(true, 2, 0, 0)).toBe(true);
    expect(shouldIgnoreOdEditTargetsMembershipNoiseDuringTipProtect(true, 2, 1, 5)).toBe(true);
    expect(shouldIgnoreOdEditTargetsMembershipNoiseDuringTipProtect(true, 2, 2, 5)).toBe(false);
    expect(shouldIgnoreOdEditTargetsMembershipNoiseDuringTipProtect(false, 2, 0, 0)).toBe(false);
    expect(shouldClearManualEditSelectionOnEmptyOdEditTargets(true)).toBe(false);
    expect(shouldClearManualEditSelectionOnEmptyOdEditTargets(false)).toBe(true);
    expect(shouldClearTipSyncedIdentityStickyRetainOnFullCatalog(true, false, 2, 2, 5)).toBe(true);
    expect(shouldClearTipSyncedIdentityStickyRetainOnFullCatalog(true, true, 2, 2, 5)).toBe(false);
    expect(shouldClearTipSyncedIdentityStickyRetainOnFullCatalog(true, false, 2, 1, 5)).toBe(false);
    expect(shouldClearTipSyncedIdentityStickyRetainOnFullCatalog(false, false, 2, 2, 5)).toBe(false);
  });

  it('retries tip remount sync host measure once when first load tick misses', () => {
    expect(shouldRetryTipRemountSyncHostMeasureAfterSrcDocLoad(
      false, true, ['a'], 'a',
    )).toBe(true);
    expect(shouldRetryTipRemountSyncHostMeasureAfterSrcDocLoad(
      true, true, ['a'], 'a',
    )).toBe(false);
    expect(shouldRetryTipRemountSyncHostMeasureAfterSrcDocLoad(
      false, true, ['a'], null,
    )).toBe(false);
    expect(shouldRetryTipRemountSyncHostMeasureAfterSrcDocLoad(
      false, false, ['a'], 'a',
    )).toBe(false);
  });

  it('cancels pending tip remount sync rAF when grace clears', () => {
    expect(shouldCancelTipRemountSyncHostMeasureRetry(true)).toBe(true);
    expect(shouldCancelTipRemountSyncHostMeasureRetry(false)).toBe(false);
  });

  it('skips deck srcDoc transport remount for edit-mode freeze tip sync', () => {
    expect(shouldSkipSrcDocTransportRemountForManualEditFreezeTipSync(false, true, true)).toBe(true);
    expect(shouldSkipSrcDocTransportRemountForManualEditFreezeTipSync(true, true, true)).toBe(false);
    expect(shouldSkipSrcDocTransportRemountForManualEditFreezeTipSync(false, false, true)).toBe(false);
    expect(shouldSkipSrcDocTransportRemountForManualEditFreezeTipSync(false, true, false)).toBe(false);
  });

  it('suppresses selection chrome until tip remasure releases latch', () => {
    expect(shouldSuppressManualEditChromeUntilTipRemasure(true)).toBe(true);
    expect(shouldSuppressManualEditChromeUntilTipRemasure(false)).toBe(false);
  });

  it('disables (inert) selection chrome until tip remasure — does not unmount', () => {
    expect(shouldDisableManualEditChromeUntilTipRemasure(true)).toBe(true);
    expect(shouldDisableManualEditChromeUntilTipRemasure(false)).toBe(false);
  });

  it('aborts in-flight gestures before tip-yield freeze sync', () => {
    expect(shouldAbortManualEditGestureForTipYieldFreezeSync(true)).toBe(true);
    expect(shouldAbortManualEditGestureForTipYieldFreezeSync(false)).toBe(false);
  });

  it('keeps hostChrome on while tip-remount chrome is inert (still mounted)', () => {
    expect(shouldPostHostChromeDuringTipRemountSuppress(true, true)).toBe(true);
    expect(shouldPostHostChromeDuringTipRemountSuppress(true, false)).toBe(true);
    expect(shouldPostHostChromeDuringTipRemountSuppress(false, true)).toBe(false);
  });

  it('releases tip-remount chrome suppress when remasure fails', () => {
    expect(shouldReleaseTipRemountChromeOnFailedRemasure(true, false)).toBe(true);
    expect(shouldReleaseTipRemountChromeOnFailedRemasure(true, true)).toBe(false);
    expect(shouldReleaseTipRemountChromeOnFailedRemasure(false, false)).toBe(false);
  });

  it('patches selected geometry when targets identity fingerprint is unchanged', () => {
    expect(shouldPatchSelectedGeometryFromTargetsBroadcast(false, ['a'])).toBe(true);
    expect(shouldPatchSelectedGeometryFromTargetsBroadcast(false, ['a', 'b'])).toBe(true);
    expect(shouldPatchSelectedGeometryFromTargetsBroadcast(true, ['a'])).toBe(false);
    expect(shouldPatchSelectedGeometryFromTargetsBroadcast(false, [])).toBe(false);
  });

  it('reseeds single inspector after tip-yield Mixed clear when no pending owns styles', () => {
    expect(shouldReseedSingleInspectorAfterTipYieldMixedClear(['a'], false)).toBe(true);
    expect(shouldReseedSingleInspectorAfterTipYieldMixedClear(['a'], true)).toBe(false);
    expect(shouldReseedSingleInspectorAfterTipYieldMixedClear([], false)).toBe(false);
    expect(shouldReseedSingleInspectorAfterTipYieldMixedClear(['a', 'b'], false)).toBe(false);
  });

  it('skips tip-yield single snapshot apply when painted tip dropped the node', () => {
    expect(shouldApplyTipYieldSingleInspectorSnapshot('<div data-od-id="a">x</div>')).toBe(true);
    expect(shouldApplyTipYieldSingleInspectorSnapshot('')).toBe(false);
    expect(shouldApplyTipYieldSingleInspectorSnapshot(null)).toBe(false);
    expect(shouldApplyTipYieldSingleInspectorSnapshot(undefined)).toBe(false);
  });

  it('refreshes host paint after tip-yield Mixed→single (2→1)', () => {
    expect(shouldRefreshHostPaintAfterTipYieldSingleReseed(['a'])).toBe(true);
    expect(shouldRefreshHostPaintAfterTipYieldSingleReseed([])).toBe(false);
    expect(shouldRefreshHostPaintAfterTipYieldSingleReseed(['a', 'b'])).toBe(false);
  });

  it('defers host paint refresh while tip-remount grace is active for paint id', () => {
    expect(shouldRefreshHostPaintAfterTipYieldSingleReseed(['a'], {
      graceId: 'a',
      paintId: 'a',
      nowMs: 1_000,
      graceUntilMs: 1_800,
    })).toBe(false);
    // Expired grace restores force host-paint refresh.
    expect(shouldRefreshHostPaintAfterTipYieldSingleReseed(['a'], {
      graceId: 'a',
      paintId: 'a',
      nowMs: 1_800,
      graceUntilMs: 1_800,
    })).toBe(true);
    // Sibling grace must not block the remaining single id.
    expect(shouldRefreshHostPaintAfterTipYieldSingleReseed(['a'], {
      graceId: 'b',
      paintId: 'a',
      nowMs: 1_000,
      graceUntilMs: 1_800,
    })).toBe(true);
  });

  it('syncs selected target identity only when seed matches selection', () => {
    expect(shouldSyncSelectedTargetIdentityAfterTipYieldSingleReseed('a', 'a')).toBe(true);
    expect(shouldSyncSelectedTargetIdentityAfterTipYieldSingleReseed('a', 'b')).toBe(false);
    expect(shouldSyncSelectedTargetIdentityAfterTipYieldSingleReseed(null, 'a')).toBe(false);
  });

  it('syncs selected-set identity after multi tip-yield reseed', () => {
    expect(shouldSyncSelectedTargetsIdentityAfterTipYieldMultiReseed(['a', 'b'])).toBe(true);
    expect(shouldSyncSelectedTargetsIdentityAfterTipYieldMultiReseed(['a'])).toBe(false);
    expect(shouldSyncSelectedTargetsIdentityAfterTipYieldMultiReseed([])).toBe(false);
  });

  it('refreshes host paint after tip-remount remasure for multi and single', () => {
    expect(shouldRefreshHostPaintAfterTipRemountRemasure(true)).toBe(true);
    expect(shouldRefreshHostPaintAfterTipRemountRemasure(false)).toBe(false);
  });

  it('does not consume tip-remount grace on sibling multi-select remasure', () => {
    expect(shouldConsumeTipRemountGeometryGraceOnRemasure(
      'el-1', 'el-1', 'el-1', 1_000, 1_800,
    )).toBe(true);
    // Sibling remasure must not clear primary grace.
    expect(shouldConsumeTipRemountGeometryGraceOnRemasure(
      'el-1', 'el-2', 'el-1', 1_000, 1_800,
    )).toBe(false);
    expect(shouldConsumeTipRemountGeometryGraceOnRemasure(
      'el-1', 'el-1', 'el-2', 1_000, 1_800,
    )).toBe(false);
    expect(shouldConsumeTipRemountGeometryGraceOnRemasure(
      'el-1', 'el-1', 'el-1', 1_800, 1_800,
    )).toBe(false);
  });

  it('clears tip-remount grace when selection leaves the grace primary', () => {
    expect(shouldClearTipRemountGeometryGraceOnSelectionChange('el-1', 'el-2')).toBe(true);
    expect(shouldClearTipRemountGeometryGraceOnSelectionChange('el-1', null)).toBe(true);
    expect(shouldClearTipRemountGeometryGraceOnSelectionChange('el-1', 'el-1')).toBe(false);
    expect(shouldClearTipRemountGeometryGraceOnSelectionChange(null, 'el-2')).toBe(false);
  });

  it('clears tip-remount grace latch on expiry (id + until must both reset)', () => {
    expect(shouldClearTipRemountGeometryGraceOnExpiry('el-1', 1_800, 1_800)).toBe(true);
    expect(shouldClearTipRemountGeometryGraceOnExpiry('el-1', 1_801, 1_800)).toBe(true);
    expect(shouldClearTipRemountGeometryGraceOnExpiry('el-1', 1_000, 1_800)).toBe(false);
    expect(shouldClearTipRemountGeometryGraceOnExpiry(null, 2_000, 1_800)).toBe(false);
    // Deck host-fit settle still open — keep latch (460).
    expect(shouldClearTipRemountGeometryGraceOnExpiry('el-1', 1_800, 1_800, 2_000)).toBe(false);
    expect(shouldClearTipRemountGeometryGraceOnExpiry('el-1', 2_000, 1_800, 2_000)).toBe(true);
  });

  it('arms tip-remount fit settle only for deck host-fit', () => {
    expect(shouldArmTipRemountFitSettleForDeckHostFit(true)).toBe(true);
    expect(shouldArmTipRemountFitSettleForDeckHostFit(false)).toBe(false);
  });

  it('remeasures tip chrome while deck host-fit settle latch is live', () => {
    expect(shouldRemeasureTipRemountAfterDeckHostFitSettle(true, ['a'], 2_000, 1_000)).toBe(true);
    expect(shouldRemeasureTipRemountAfterDeckHostFitSettle(true, ['a', 'b'], 2_000, 1_000)).toBe(true);
    expect(shouldRemeasureTipRemountAfterDeckHostFitSettle(true, [], 2_000, 1_000)).toBe(false);
    expect(shouldRemeasureTipRemountAfterDeckHostFitSettle(false, ['a'], 2_000, 1_000)).toBe(false);
    expect(shouldRemeasureTipRemountAfterDeckHostFitSettle(true, ['a'], 1_000, 1_000)).toBe(false);
    expect(shouldRemeasureTipRemountAfterDeckHostFitSettle(true, ['a'], 0, 1_000)).toBe(false);
  });

  it('schedules fit-settle remasure on load when settle latch is armed', () => {
    expect(shouldScheduleTipRemountFitSettleRemasureOnLoad(2_000, 1_000)).toBe(true);
    expect(shouldScheduleTipRemountFitSettleRemasureOnLoad(1_000, 1_000)).toBe(false);
    expect(shouldScheduleTipRemountFitSettleRemasureOnLoad(0, 1_000)).toBe(false);
  });

  it('defers tip-remount grace consume while deck host-fit settle is open', () => {
    expect(shouldDeferTipRemountGraceConsumeForDeckHostFitSettle(2_000, 1_000)).toBe(true);
    expect(shouldDeferTipRemountGraceConsumeForDeckHostFitSettle(1_000, 1_000)).toBe(false);
    expect(shouldDeferTipRemountGraceConsumeForDeckHostFitSettle(0, 1_000)).toBe(false);
    expect(tipRemountFitSettleExpired(1_000, 0)).toBe(true);
    expect(tipRemountFitSettleExpired(1_000, 2_000)).toBe(false);
  });

  it('skips wild-jump during tip-remount deck host-fit settle', () => {
    expect(shouldSkipWildJumpDuringTipRemountFitSettle(
      'el-1', 'el-1', 'el-1', 1_000, 2_000,
    )).toBe(true);
    expect(shouldSkipWildJumpDuringTipRemountFitSettle(
      'el-1', 'el-2', 'el-1', 1_000, 2_000,
    )).toBe(false);
    expect(shouldSkipWildJumpDuringTipRemountFitSettle(
      'el-1', 'el-1', 'el-1', 2_000, 2_000,
    )).toBe(false);
  });

  it('skips wild-jump for multi tip-remount selected members', () => {
    expect(shouldSkipWildJumpForTipRemountSelectedMember(
      'el-1', 'el-2', ['el-1', 'el-2'], 1_000, 1_800,
    )).toBe(true);
    expect(shouldSkipWildJumpForTipRemountSelectedMember(
      'el-1', 'el-3', ['el-1', 'el-2'], 1_000, 1_800,
    )).toBe(false);
    expect(shouldSkipWildJumpForTipRemountSelectedMember(
      'el-1', 'el-2', ['el-1', 'el-2'], 1_800, 1_800,
    )).toBe(false);
    expect(shouldSkipWildJumpDuringTipRemountFitSettleForSelectedMember(
      'el-1', 'el-2', ['el-1', 'el-2'], 1_000, 2_000,
    )).toBe(true);
    expect(shouldSkipWildJumpDuringTipRemountFitSettleForSelectedMember(
      'el-1', 'el-2', ['el-1', 'el-2'], 2_000, 2_000,
    )).toBe(false);
  });

  it('refreshes host metrics after multi tip-remount remasure', () => {
    expect(shouldRefreshHostMetricsAfterTipRemountMultiRemasure(2, true)).toBe(true);
    expect(shouldRefreshHostMetricsAfterTipRemountMultiRemasure(3, true)).toBe(true);
    expect(shouldRefreshHostMetricsAfterTipRemountMultiRemasure(1, true)).toBe(true);
    expect(shouldRefreshHostMetricsAfterTipRemountMultiRemasure(2, false)).toBe(false);
    expect(shouldRefreshHostMetricsAfterTipRemountMultiRemasure(0, true)).toBe(false);
    expect(shouldBumpGeomEpochAfterTipRemountMultiRemasure(2, true)).toBe(true);
    expect(shouldBumpGeomEpochAfterTipRemountMultiRemasure(1, true)).toBe(false);
    expect(shouldBumpGeomEpochAfterTipRemountMultiRemasure(2, false)).toBe(false);
  });

  it('detects tip-remount session from grace or fit-settle (466)', () => {
    expect(tipRemountSessionActive('el-1', 1_000, 1_800, 0)).toBe(true);
    expect(tipRemountSessionActive('el-1', 1_000, 0, 1_500)).toBe(true);
    expect(tipRemountSessionActive('el-1', 2_000, 1_800, 1_500)).toBe(false);
    expect(tipRemountSessionActive(null, 1_000, 1_800, 1_500)).toBe(false);
  });

  it('keeps tip-remount session during post-settle identity hold (468)', () => {
    expect(tipRemountSessionActive(null, 1_000, 0, 0, 1_400)).toBe(true);
    expect(tipRemountSessionActive(null, 1_400, 0, 0, 1_400)).toBe(false);
    expect(tipRemountSessionActive('el-1', 2_000, 1_800, 0, 2_500)).toBe(true);
    expect(nextTipRemountIdentityHoldUntilMs(1_000, true, 450)).toBe(1_450);
    expect(nextTipRemountIdentityHoldUntilMs(1_000, false, 450)).toBe(0);
    expect(shouldReadSingleInspectorStylesFromSourceOnlyForOdEditTargets()).toBe(true);
  });

  it('arms identity hold only on consume/expiry/safety — not selection (469)', () => {
    expect(shouldArmTipRemountIdentityHoldOnGraceClear('consume')).toBe(true);
    expect(shouldArmTipRemountIdentityHoldOnGraceClear('expiry')).toBe(true);
    expect(shouldArmTipRemountIdentityHoldOnGraceClear('safety')).toBe(true);
    expect(shouldArmTipRemountIdentityHoldOnGraceClear('selection')).toBe(false);
    expect(shouldArmTipRemountIdentityHoldOnGraceClear('mode-exit')).toBe(false);
    expect(shouldPreserveTipSyncedStylesOnOdEditTargets(true, false)).toBe(true);
    expect(shouldPreserveTipSyncedStylesOnOdEditTargets(true, true)).toBe(false);
    expect(shouldPreserveTipSyncedStylesOnOdEditTargets(false, false)).toBe(false);
  });

  it('retains tip identity after timed hold until selection leave (472)', () => {
    expect(shouldRetainTipSyncedIdentityAfterHold(false, true, false)).toBe(true);
    expect(shouldRetainTipSyncedIdentityAfterHold(true, false, false)).toBe(true);
    expect(shouldRetainTipSyncedIdentityAfterHold(false, false, false)).toBe(false);
    expect(shouldRetainTipSyncedIdentityAfterHold(false, true, true)).toBe(false);
    expect(shouldClearTipSyncedIdentityStickyRetainOnGraceClear('selection')).toBe(true);
    expect(shouldClearTipSyncedIdentityStickyRetainOnGraceClear('mode-exit')).toBe(true);
    expect(shouldClearTipSyncedIdentityStickyRetainOnGraceClear('consume')).toBe(false);
    expect(shouldClearTipSyncedIdentityStickyRetainOnGraceClear('expiry')).toBe(false);
    expect(shouldClearTipSyncedIdentityStickyRetainOnGraceClear('safety')).toBe(false);
    expect(shouldDeferTipSyncedIdentityStickyClearUntilAfterPreserve(true)).toBe(true);
    expect(shouldDeferTipSyncedIdentityStickyClearUntilAfterPreserve(false)).toBe(false);
  });

  it('skips identity-only Mixed reseed during tip remount (466)', () => {
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringTipRemount(false, true)).toBe(true);
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringTipRemount(true, true)).toBe(false);
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringTipRemount(false, false)).toBe(false);
  });

  it('does not skip / allows pending reseed during tip protect (471)', () => {
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringTipRemount(false, true, true)).toBe(false);
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringTipRemount(false, true, false)).toBe(true);
    expect(shouldAllowOdEditTargetsPendingReseedDuringTipProtect(true, false, false, true)).toBe(true);
    expect(shouldAllowOdEditTargetsPendingReseedDuringTipProtect(true, false, true, false)).toBe(true);
    expect(shouldAllowOdEditTargetsPendingReseedDuringTipProtect(true, true, false, true)).toBe(false);
    expect(shouldAllowOdEditTargetsPendingReseedDuringTipProtect(false, false, false, true)).toBe(false);
  });

  it('preserves tip-synced styles on bridge targets (467)', () => {
    const bridge = { id: 'a', styles: { color: 'red' } };
    const tip = { color: 'blue' };
    expect(withPreservedTipSyncedStylesOnBridgeTarget(bridge, tip).styles).toEqual(tip);
    expect(withPreservedTipSyncedStylesOnBridgeTarget(bridge, null)).toBe(bridge);
    expect(withPreservedTipSyncedStylesOnBridgeTarget(bridge, undefined)).toBe(bridge);

    const primary = { id: 'a', styles: { color: 'tip' } };
    const catalog = [
      { id: 'a', styles: { color: 'catalog-a' } },
      { id: 'b', styles: { color: 'catalog-b' } },
    ];
    expect(resolveTipSyncedStylesForOdEditTargetsPreserve('a', primary, catalog)).toEqual({
      color: 'tip',
    });
    expect(resolveTipSyncedStylesForOdEditTargetsPreserve('b', primary, catalog)).toEqual({
      color: 'catalog-b',
    });
    expect(resolveTipSyncedStylesForOdEditTargetsPreserve('c', primary, catalog)).toBeUndefined();
  });

  it('preserves tip-synced identity fields on bridge targets (470)', () => {
    const bridge = {
      id: 'a',
      kind: 'text' as const,
      label: 'bridge',
      tagName: 'P',
      className: 'live',
      text: 'live',
      fields: { href: '', src: '', alt: '' },
      attributes: {},
      styles: { color: 'red' },
      isLayoutContainer: false,
      outerHtml: '',
      rect: { x: 1, y: 2, width: 3, height: 4 },
    };
    const tip = {
      ...bridge,
      label: 'tip',
      className: 'tip-class',
      text: 'tip text',
      styles: { color: 'blue' },
      outerHtml: '<p class="tip-class">tip text</p>',
      rect: { x: 9, y: 9, width: 9, height: 9 },
    };
    const merged = withPreservedTipSyncedIdentityOnBridgeTarget(bridge, tip);
    expect(merged.outerHtml).toBe(tip.outerHtml);
    expect(merged.text).toBe('tip text');
    expect(merged.className).toBe('tip-class');
    expect(merged.styles).toEqual({ color: 'blue' });
    // Bridge geometry wins.
    expect(merged.rect).toEqual(bridge.rect);
    expect(withPreservedTipSyncedIdentityOnBridgeTarget(bridge, null)).toBe(bridge);

    const catalog = [tip, { ...tip, id: 'b', outerHtml: '<b/>' }];
    expect(resolveTipSyncedTargetForOdEditTargetsPreserve('a', tip, catalog)).toBe(tip);
    expect(resolveTipSyncedTargetForOdEditTargetsPreserve('b', tip, catalog)?.outerHtml).toBe('<b/>');
  });
});
