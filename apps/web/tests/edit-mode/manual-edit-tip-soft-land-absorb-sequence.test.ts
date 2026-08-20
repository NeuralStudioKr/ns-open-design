/**
 * Tip remount soft-land → absorb → quiet → live sequence (507/509)
 * and od-edit-targets selection-ids clear of follow (508).
 */
import { describe, expect, it } from 'vitest';
import {
  TIP_POST_STICKY_SOFT_LAND_CATALOGS,
  clearTipPostAbsorbInspectorQuiet,
  clearTipPostSoftLandExitLatch,
  consumeTipPostStickySoftLandCatalog,
  shouldAbsorbLiveIdentityFingerprintOnPostExitLatch,
  shouldArmTipPostAbsorbInspectorQuiet,
  shouldArmTipPostExitLatchMixedAbsorb,
  shouldArmTipPostExitLatchMixedAbsorbOnSoftLandEarlyExit,
  shouldArmTipPostSoftLandExitLatch,
  shouldArmTipPostStickySoftLand,
  shouldClearManualEditSelectionOnEmptyOdEditTargets,
  shouldClearTipPostProtectOnOdEditTargetsSelectionIdsChange,
  shouldEarlyExitTipPostStickySoftLand,
  shouldRetainTipSyncedIdentityDuringPostSoftLandExitLatch,
  shouldRetainTipSyncedIdentityDuringPostStickySoftLand,
  shouldSettleInspectorStylesOnPostExitAbsorb,
  shouldPreferPendingDraftOverAbsorbInspectorSettle,
  shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet,
  shouldSkipOdEditTargetsIdentityMixedReseedDuringPostExitAbsorb,
  shouldTreatPostAbsorbQuietAsTipProtect,
  shouldTreatPostExitAbsorbAsTipProtect,
  tipRemountPostProtectArmed,
} from '../../src/edit-mode/manual-edit-freeze';

type TipPostProtectState = {
  softLandRemaining: number;
  exitLatch: boolean;
  absorb: boolean;
  quiet: boolean;
  followUntilMs: number;
};

function armSoftLandFromStickyClear(): TipPostProtectState {
  expect(shouldArmTipPostStickySoftLand(true)).toBe(true);
  return {
    softLandRemaining: TIP_POST_STICKY_SOFT_LAND_CATALOGS,
    exitLatch: false,
    absorb: false,
    quiet: false,
    followUntilMs: 7_000,
  };
}

describe('manual-edit tip soft-land→absorb sequence (507/509)', () => {
  it('walks soft-land → exit latch → absorb → quiet → live', () => {
    let state = armSoftLandFromStickyClear();
    expect(state.softLandRemaining).toBe(2);
    expect(tipRemountPostProtectArmed({
      softLandRemaining: state.softLandRemaining,
      absorb: state.absorb,
      postAbsorbQuiet: state.quiet,
    })).toBe(true);

    // Catalog A: soft-land tick 1 → remaining 1
    expect(shouldRetainTipSyncedIdentityDuringPostStickySoftLand(
      state.softLandRemaining, false,
    )).toBe(true);
    state.softLandRemaining = consumeTipPostStickySoftLandCatalog(
      state.softLandRemaining, false,
    );
    expect(state.softLandRemaining).toBe(1);

    // Catalog B: soft-land tick 2 → remaining 0, arm exit latch
    const softLandAtEntry = state.softLandRemaining;
    state.softLandRemaining = consumeTipPostStickySoftLandCatalog(
      softLandAtEntry, false,
    );
    expect(state.softLandRemaining).toBe(0);
    expect(shouldArmTipPostSoftLandExitLatch(
      softLandAtEntry, state.softLandRemaining, false, false,
    )).toBe(true);
    state.exitLatch = true;

    // Catalog C: exit-latch preserve, then clear latch and arm absorb
    expect(shouldRetainTipSyncedIdentityDuringPostSoftLandExitLatch(
      state.exitLatch, false,
    )).toBe(true);
    expect(shouldArmTipPostExitLatchMixedAbsorb(state.exitLatch, false)).toBe(true);
    state.exitLatch = clearTipPostSoftLandExitLatch();
    state.absorb = true;

    // Catalog D: absorb tip-protect + source-only inspector settle, arm quiet
    expect(shouldTreatPostExitAbsorbAsTipProtect(state.absorb)).toBe(true);
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringPostExitAbsorb(
      false, state.absorb,
    )).toBe(true);
    // Identity-churn path stays skipped, but absorb must settle draft once (511).
    expect(shouldSettleInspectorStylesOnPostExitAbsorb(state.absorb, false)).toBe(true);
    expect(shouldSettleInspectorStylesOnPostExitAbsorb(state.absorb, false, true)).toBe(false);
    // Pending draft blocks settle; pending-aware path still allowed (514).
    expect(shouldPreferPendingDraftOverAbsorbInspectorSettle(true, state.absorb)).toBe(true);
    expect(shouldPreferPendingDraftOverAbsorbInspectorSettle(false, state.absorb)).toBe(false);
    expect(shouldAbsorbLiveIdentityFingerprintOnPostExitLatch(
      state.absorb, false,
    )).toBe(true);
    state.absorb = false;
    expect(shouldArmTipPostAbsorbInspectorQuiet(true, false)).toBe(true);
    state.quiet = true;

    // Catalog E: post-absorb quiet — Mixed skip without tip-preserve (509)
    expect(shouldTreatPostAbsorbQuietAsTipProtect(state.quiet)).toBe(true);
    expect(shouldSettleInspectorStylesOnPostExitAbsorb(false, false)).toBe(false);
    expect(shouldClearManualEditSelectionOnEmptyOdEditTargets(
      shouldTreatPostAbsorbQuietAsTipProtect(state.quiet),
    )).toBe(false);
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet(
      false, state.quiet,
    )).toBe(true);
    state.quiet = clearTipPostAbsorbInspectorQuiet();
    expect(state.quiet).toBe(false);

    // Live: no tip post-protect left
    expect(tipRemountPostProtectArmed({
      softLandRemaining: state.softLandRemaining,
      absorb: state.absorb,
      postAbsorbQuiet: state.quiet,
    })).toBe(false);
    expect(shouldClearManualEditSelectionOnEmptyOdEditTargets(false)).toBe(true);
  });

  it('early-exits soft-land into absorb then quiet', () => {
    let state = armSoftLandFromStickyClear();
    const softLandAtEntry = state.softLandRemaining;
    expect(shouldEarlyExitTipPostStickySoftLand(
      softLandAtEntry, false, 'id-fp:same', 'id-fp:same',
    )).toBe(true);
    expect(shouldArmTipPostExitLatchMixedAbsorbOnSoftLandEarlyExit(true, false))
      .toBe(true);
    state.softLandRemaining = 0;
    state.absorb = true;
    expect(shouldAbsorbLiveIdentityFingerprintOnPostExitLatch(state.absorb, false))
      .toBe(true);
    state.absorb = false;
    state.quiet = true;
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet(
      false, state.quiet,
    )).toBe(true);
    state.quiet = clearTipPostAbsorbInspectorQuiet();
    expect(tipRemountPostProtectArmed({
      softLandRemaining: state.softLandRemaining,
      absorb: state.absorb,
      postAbsorbQuiet: state.quiet,
    })).toBe(false);
  });

  it('selection-ids change clears soft-land/absorb/quiet/follow (508)', () => {
    const softLandAtEntry = TIP_POST_STICKY_SOFT_LAND_CATALOGS;
    expect(shouldClearTipPostProtectOnOdEditTargetsSelectionIdsChange(true)).toBe(true);
    expect(shouldRetainTipSyncedIdentityDuringPostStickySoftLand(
      softLandAtEntry, true,
    )).toBe(false);
    const remaining = consumeTipPostStickySoftLandCatalog(softLandAtEntry, true);
    expect(remaining).toBe(0);
    expect(shouldArmTipPostSoftLandExitLatch(softLandAtEntry, remaining, true, false))
      .toBe(false);
    expect(shouldArmTipPostExitLatchMixedAbsorb(true, true)).toBe(false);
    expect(shouldArmTipPostAbsorbInspectorQuiet(true, true)).toBe(false);
    // Follow must be dropped with the same clear gate (508).
    let followUntilMs = 7_000;
    if (shouldClearTipPostProtectOnOdEditTargetsSelectionIdsChange(true)) {
      followUntilMs = 0;
    }
    expect(followUntilMs).toBe(0);
  });
});
