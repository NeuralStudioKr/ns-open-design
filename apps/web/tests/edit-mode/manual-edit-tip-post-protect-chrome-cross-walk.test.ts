/**
 * Tip remount post-protect × chrome-release cross walk (544).
 * Soft-land/absorb must settle to live before chrome-release tracks arm;
 * paint-sync and pointer-unlock then run as parallel tracks (540).
 */
import { describe, expect, it } from 'vitest';
import {
  TIP_POST_STICKY_SOFT_LAND_CATALOGS,
  TIP_REMOUNT_CHROME_RELEASE_PREFIX,
  TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
  TIP_REMOUNT_PAINT_SYNC_TRACK,
  TIP_REMOUNT_POINTER_UNLOCK_TRACK,
  TIP_REMOUNT_POST_PROTECT_SEQUENCE,
  clearTipPostAbsorbInspectorQuiet,
  clearTipPostSoftLandExitLatch,
  clearTipRemountPaintSyncHold,
  clearTipRemountPostUnlockQuiet,
  consumeTipPostStickySoftLandCatalog,
  shouldArmTipPostAbsorbInspectorQuiet,
  shouldArmTipPostExitLatchMixedAbsorb,
  shouldArmTipPostSoftLandExitLatch,
  shouldArmTipPostStickySoftLand,
  shouldArmTipRemountChromeUnlockPointerGate,
  shouldArmTipRemountPaintSyncHold,
  shouldArmTipRemountPostUnlockQuiet,
  shouldDeferTipRemountGeomEpochBumpForPaintSync,
  shouldFlushDeferredTipRemountGeomEpochAfterPaintSyncHold,
  shouldFlushDeferredTipRemountGeometryBeforeUnlockGateClear,
  shouldReleaseTipRemountChromeAfterFitSettleRemasure,
  shouldRetainTipSyncedIdentityDuringPostSoftLandExitLatch,
  shouldRetainTipSyncedIdentityDuringPostStickySoftLand,
  shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet,
  shouldSpendTipRemountPostUnlockQuiet,
  shouldTreatPostAbsorbQuietAsTipProtect,
  shouldTreatPostExitAbsorbAsTipProtect,
  tipRemountPostProtectArmed,
} from '../../src/edit-mode/manual-edit-freeze';

describe('manual-edit tip post-protect × chrome-release cross walk (544)', () => {
  it('pins post-protect then parallel chrome tracks as the cross contract', () => {
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
    expect(TIP_REMOUNT_PAINT_SYNC_TRACK.indexOf('geom-epoch-flush')).toBeGreaterThan(
      TIP_REMOUNT_PAINT_SYNC_TRACK.indexOf('paint-sync-hold'),
    );
    expect(TIP_REMOUNT_POINTER_UNLOCK_TRACK.indexOf('post-unlock-quiet')).toBeGreaterThan(
      TIP_REMOUNT_POINTER_UNLOCK_TRACK.indexOf('unlock-pointer-gate'),
    );
    // Cross invariant: geom-epoch is paint-track, not after pointer quiet.
    expect(TIP_REMOUNT_PAINT_SYNC_TRACK).toContain('geom-epoch-flush');
    expect(TIP_REMOUNT_POINTER_UNLOCK_TRACK).not.toContain('geom-epoch-flush');
  });

  it('walks soft-land→live then chrome-release paint∥pointer tracks', () => {
    // --- Post-protect track (507/509) ---
    expect(shouldArmTipPostStickySoftLand(true)).toBe(true);
    let softLand = TIP_POST_STICKY_SOFT_LAND_CATALOGS;
    expect(tipRemountPostProtectArmed({ softLandRemaining: softLand })).toBe(true);

    softLand = consumeTipPostStickySoftLandCatalog(softLand, false);
    expect(shouldRetainTipSyncedIdentityDuringPostStickySoftLand(softLand, false)).toBe(true);
    const softLandAtEntry = softLand;
    softLand = consumeTipPostStickySoftLandCatalog(softLandAtEntry, false);
    expect(shouldArmTipPostSoftLandExitLatch(
      softLandAtEntry, softLand, false, false,
    )).toBe(true);
    let exitLatch = true;
    expect(shouldRetainTipSyncedIdentityDuringPostSoftLandExitLatch(exitLatch, false)).toBe(true);
    expect(shouldArmTipPostExitLatchMixedAbsorb(exitLatch, false)).toBe(true);
    exitLatch = clearTipPostSoftLandExitLatch();
    let absorb = true;
    expect(shouldTreatPostExitAbsorbAsTipProtect(absorb)).toBe(true);
    expect(shouldArmTipPostAbsorbInspectorQuiet(absorb, false)).toBe(true);
    absorb = false;
    let quiet = true;
    expect(shouldTreatPostAbsorbQuietAsTipProtect(quiet)).toBe(true);
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet(
      false, quiet,
    )).toBe(true);
    quiet = clearTipPostAbsorbInspectorQuiet();
    expect(tipRemountPostProtectArmed({
      softLandRemaining: softLand,
      exitLatch,
      absorb,
      postAbsorbQuiet: quiet,
    })).toBe(false);

    // --- Chrome-release prefix ---
    let chromeSuppressed = true;
    expect(shouldReleaseTipRemountChromeAfterFitSettleRemasure(
      chromeSuppressed,
      true,
      TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
    )).toBe(true);
    expect(shouldDeferTipRemountGeomEpochBumpForPaintSync(false, true)).toBe(true);
    let deferredEpoch = true;
    expect(shouldArmTipRemountPaintSyncHold(chromeSuppressed, false)).toBe(true);
    chromeSuppressed = false;
    let paintSyncHold = true;

    // --- Parallel paint track ---
    expect(shouldFlushDeferredTipRemountGeomEpochAfterPaintSyncHold(
      true,
      deferredEpoch,
    )).toBe(true);
    deferredEpoch = false;
    paintSyncHold = clearTipRemountPaintSyncHold();

    // --- Parallel pointer track ---
    expect(shouldArmTipRemountChromeUnlockPointerGate(
      true, false, true, false, false,
    )).toBe(true);
    let unlockGate = true;
    expect(shouldFlushDeferredTipRemountGeometryBeforeUnlockGateClear(
      unlockGate,
      true,
    )).toBe(true);
    expect(shouldArmTipRemountPostUnlockQuiet(unlockGate)).toBe(true);
    let postUnlockQuiet = true;
    unlockGate = false;
    expect(shouldSpendTipRemountPostUnlockQuiet(postUnlockQuiet, true)).toBe(true);
    postUnlockQuiet = clearTipRemountPostUnlockQuiet();

    expect(chromeSuppressed).toBe(false);
    expect(paintSyncHold).toBe(false);
    expect(unlockGate).toBe(false);
    expect(postUnlockQuiet).toBe(false);
    expect(deferredEpoch).toBe(false);
  });
});
