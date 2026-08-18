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
  shouldArmTipRemountFitSettleForDeckHostFit,
  shouldRemeasureTipRemountAfterDeckHostFitSettle,
  shouldDeferTipRemountGraceConsumeForDeckHostFitSettle,
  shouldSkipWildJumpDuringTipRemountFitSettle,
  shouldSkipWildJumpForTipRemountSelectedMember,
  shouldSkipWildJumpDuringTipRemountFitSettleForSelectedMember,
  shouldRefreshHostMetricsAfterTipRemountMultiRemasure,
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
    expect(shouldRefreshHostMetricsAfterTipRemountMultiRemasure(1, true)).toBe(false);
    expect(shouldRefreshHostMetricsAfterTipRemountMultiRemasure(2, false)).toBe(false);
  });
});
