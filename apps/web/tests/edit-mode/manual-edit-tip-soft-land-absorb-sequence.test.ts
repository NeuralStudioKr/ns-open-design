/**
 * Tip remount soft-land → exit latch → absorb state-machine sequence (507).
 * Exercises freeze helpers in catalog order without mounting FileViewer.
 */
import { describe, expect, it } from 'vitest';
import {
  TIP_POST_STICKY_SOFT_LAND_CATALOGS,
  clearTipPostSoftLandExitLatch,
  consumeTipPostStickySoftLandCatalog,
  shouldAbsorbLiveIdentityFingerprintOnPostExitLatch,
  shouldArmTipPostExitLatchMixedAbsorb,
  shouldArmTipPostExitLatchMixedAbsorbOnSoftLandEarlyExit,
  shouldArmTipPostSoftLandExitLatch,
  shouldArmTipPostStickySoftLand,
  shouldClearManualEditSelectionOnEmptyOdEditTargets,
  shouldEarlyExitTipPostStickySoftLand,
  shouldRetainTipSyncedIdentityDuringPostSoftLandExitLatch,
  shouldRetainTipSyncedIdentityDuringPostStickySoftLand,
  shouldSkipOdEditTargetsIdentityMixedReseedDuringPostExitAbsorb,
  shouldTreatPostExitAbsorbAsTipProtect,
  tipRemountPostProtectArmed,
} from '../../src/edit-mode/manual-edit-freeze';

type TipPostProtectState = {
  softLandRemaining: number;
  exitLatch: boolean;
  absorb: boolean;
};

function armSoftLandFromStickyClear(): TipPostProtectState {
  expect(shouldArmTipPostStickySoftLand(true)).toBe(true);
  return {
    softLandRemaining: TIP_POST_STICKY_SOFT_LAND_CATALOGS,
    exitLatch: false,
    absorb: false,
  };
}

describe('manual-edit tip soft-land→absorb sequence (507)', () => {
  it('walks soft-land catalogs → exit latch → absorb → live', () => {
    let state = armSoftLandFromStickyClear();
    expect(state.softLandRemaining).toBe(2);
    expect(tipRemountPostProtectArmed({
      softLandRemaining: state.softLandRemaining,
      absorb: state.absorb,
    })).toBe(true);

    // Catalog A: soft-land tick 1 → remaining 1
    expect(shouldRetainTipSyncedIdentityDuringPostStickySoftLand(
      state.softLandRemaining, false,
    )).toBe(true);
    expect(shouldClearManualEditSelectionOnEmptyOdEditTargets(true)).toBe(false);
    state.softLandRemaining = consumeTipPostStickySoftLandCatalog(
      state.softLandRemaining, false,
    );
    expect(state.softLandRemaining).toBe(1);
    expect(shouldArmTipPostSoftLandExitLatch(1, state.softLandRemaining, false, false))
      .toBe(false);

    // Catalog B: soft-land tick 2 → remaining 0, arm exit latch
    const softLandAtEntry = state.softLandRemaining;
    expect(shouldRetainTipSyncedIdentityDuringPostStickySoftLand(
      softLandAtEntry, false,
    )).toBe(true);
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
    expect(state.exitLatch).toBe(false);

    // Catalog D: absorb tip-protect + Mixed skip, then spend absorb
    expect(shouldTreatPostExitAbsorbAsTipProtect(state.absorb)).toBe(true);
    expect(shouldClearManualEditSelectionOnEmptyOdEditTargets(
      shouldTreatPostExitAbsorbAsTipProtect(state.absorb),
    )).toBe(false);
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringPostExitAbsorb(
      false, state.absorb,
    )).toBe(true);
    expect(shouldAbsorbLiveIdentityFingerprintOnPostExitLatch(
      state.absorb, false,
    )).toBe(true);
    state.absorb = false;

    // Live: no tip post-protect left
    expect(tipRemountPostProtectArmed({
      softLandRemaining: state.softLandRemaining,
      absorb: state.absorb,
    })).toBe(false);
    expect(shouldClearManualEditSelectionOnEmptyOdEditTargets(false)).toBe(true);
  });

  it('early-exits soft-land into absorb without exit latch', () => {
    let state = armSoftLandFromStickyClear();
    const softLandAtEntry = state.softLandRemaining;
    const preserved = 'id-fp:same';
    const live = 'id-fp:same';

    expect(shouldEarlyExitTipPostStickySoftLand(
      softLandAtEntry, false, preserved, live,
    )).toBe(true);
    expect(shouldArmTipPostExitLatchMixedAbsorbOnSoftLandEarlyExit(true, false))
      .toBe(true);
    // Early exit does not arm exit latch (shouldArmTipPostSoftLandExitLatch blocks).
    expect(shouldArmTipPostSoftLandExitLatch(softLandAtEntry, 0, false, true))
      .toBe(false);
    state.softLandRemaining = 0;
    state.exitLatch = false;
    state.absorb = true;

    expect(shouldTreatPostExitAbsorbAsTipProtect(state.absorb)).toBe(true);
    expect(shouldAbsorbLiveIdentityFingerprintOnPostExitLatch(state.absorb, false))
      .toBe(true);
    state.absorb = false;
    expect(tipRemountPostProtectArmed({
      softLandRemaining: state.softLandRemaining,
      absorb: state.absorb,
    })).toBe(false);
  });

  it('selection change aborts soft-land without arming exit latch or absorb', () => {
    const softLandAtEntry = TIP_POST_STICKY_SOFT_LAND_CATALOGS;
    expect(shouldRetainTipSyncedIdentityDuringPostStickySoftLand(
      softLandAtEntry, true,
    )).toBe(false);
    const remaining = consumeTipPostStickySoftLandCatalog(softLandAtEntry, true);
    expect(remaining).toBe(0);
    expect(shouldArmTipPostSoftLandExitLatch(softLandAtEntry, remaining, true, false))
      .toBe(false);
    expect(shouldArmTipPostExitLatchMixedAbsorb(true, true)).toBe(false);
    expect(shouldTreatPostExitAbsorbAsTipProtect(false)).toBe(false);
  });
});
