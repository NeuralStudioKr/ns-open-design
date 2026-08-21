/**
 * Tip remount chrome-release sequence walk (537) — mirrors soft-land absorb
 * sequence coverage for TIP_REMOUNT_CHROME_RELEASE_SEQUENCE.
 */
import { describe, expect, it } from 'vitest';
import {
  TIP_REMOUNT_CHROME_RELEASE_SEQUENCE,
  TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
  TIP_REMOUNT_POST_UNLOCK_QUIET_TIMEOUT_MS,
  clearTipRemountPaintSyncHold,
  clearTipRemountPostUnlockQuiet,
  nextTipRemountPaintSyncHoldToken,
  shouldApplyTipRemountPaintSyncHoldClear,
  shouldArmTipRemountChromeUnlockPointerGate,
  shouldArmTipRemountPaintSyncHold,
  shouldArmTipRemountPostUnlockQuiet,
  shouldDeferTipRemountGeomEpochBumpForPaintSync,
  shouldDeferTipRemountPostReleaseGeometryApply,
  shouldFlushDeferredTipRemountGeomEpochAfterPaintSyncHold,
  shouldFlushDeferredTipRemountGeometryBeforeUnlockGateClear,
  shouldForceSpendTipRemountPostUnlockQuiet,
  shouldReleaseTipRemountChromeAfterFitSettleRemasure,
  shouldRetainCurrentHostPaintOnTipRemountPaintMiss,
  shouldReuseLastHostRectOnTipRemountMeasureMiss,
  shouldSpendTipRemountPostUnlockQuiet,
  shouldTrustTipRemountHostPaintDespiteComposedStale,
} from '../../src/edit-mode/manual-edit-freeze';

type ChromeReleaseState = {
  step: (typeof TIP_REMOUNT_CHROME_RELEASE_SEQUENCE)[number];
  chromeSuppressed: boolean;
  paintSyncHold: boolean;
  unlockGate: boolean;
  deferredGeometryPending: boolean;
  postUnlockQuiet: boolean;
  deferredEpochBump: boolean;
  paintSyncToken: number;
  hostPaintOk: boolean;
};

function armChromeSuppress(): ChromeReleaseState {
  return {
    step: 'chrome-suppress',
    chromeSuppressed: true,
    paintSyncHold: false,
    unlockGate: false,
    deferredGeometryPending: false,
    postUnlockQuiet: false,
    deferredEpochBump: false,
    paintSyncToken: 0,
    hostPaintOk: true,
  };
}

describe('manual-edit tip chrome-release sequence (537)', () => {
  it('pins chrome-release sequence contract order', () => {
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
  });

  it('walks chrome-suppress → live through helpers', () => {
    let state = armChromeSuppress();
    expect(state.step).toBe(TIP_REMOUNT_CHROME_RELEASE_SEQUENCE[0]);

    // fit-remasure @ chrome-release delay — still suppressed, will release
    state.step = 'fit-remasure';
    expect(shouldReleaseTipRemountChromeAfterFitSettleRemasure(
      state.chromeSuppressed,
      true,
      TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
    )).toBe(true);
    // Epoch bump deferred because release pending this frame (533)
    expect(shouldDeferTipRemountGeomEpochBumpForPaintSync(
      state.paintSyncHold,
      true,
    )).toBe(true);
    state.deferredEpochBump = true;

    // chrome-release → paint-sync-hold
    state.step = 'chrome-release';
    expect(shouldArmTipRemountPaintSyncHold(state.chromeSuppressed, false)).toBe(true);
    state.chromeSuppressed = false;
    state.paintSyncHold = true;
    state.step = 'paint-sync-hold';
    state.paintSyncToken = nextTipRemountPaintSyncHoldToken(state.paintSyncToken);
    expect(shouldTrustTipRemountHostPaintDespiteComposedStale(
      false,
      true,
      state.paintSyncHold,
    )).toBe(true);
    expect(shouldReuseLastHostRectOnTipRemountMeasureMiss(
      false,
      false,
      true,
      state.paintSyncHold,
    )).toBe(true);
    expect(shouldRetainCurrentHostPaintOnTipRemountPaintMiss(
      state.paintSyncHold,
      false,
      state.hostPaintOk,
    )).toBe(true);

    // unlock-pointer-gate (hover or buttons-down)
    state.step = 'unlock-pointer-gate';
    expect(shouldArmTipRemountChromeUnlockPointerGate(
      true,
      false,
      true,
      false,
      state.postUnlockQuiet,
    )).toBe(true);
    state.unlockGate = true;

    // Late remasure while unlock gate + hover would defer (516/525)
    expect(shouldDeferTipRemountPostReleaseGeometryApply(
      state.chromeSuppressed,
      900,
      true,
      TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
      state.unlockGate,
      state.postUnlockQuiet,
    )).toBe(true);
    state.deferredGeometryPending = true;

    // pointerup: flush deferred before unlock clear (525)
    state.step = 'pointerup-deferred-flush';
    expect(shouldFlushDeferredTipRemountGeometryBeforeUnlockGateClear(
      state.unlockGate,
      state.deferredGeometryPending,
    )).toBe(true);
    state.deferredGeometryPending = false;

    // post-unlock quiet (528/531)
    state.step = 'post-unlock-quiet';
    expect(shouldArmTipRemountPostUnlockQuiet(state.unlockGate)).toBe(true);
    state.postUnlockQuiet = true;
    state.unlockGate = false;
    expect(shouldDeferTipRemountPostReleaseGeometryApply(
      false,
      900,
      true,
      TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
      false,
      state.postUnlockQuiet,
    )).toBe(false);
    expect(shouldArmTipRemountChromeUnlockPointerGate(
      true,
      false,
      true,
      false,
      state.postUnlockQuiet,
    )).toBe(false);
    expect(TIP_REMOUNT_POST_UNLOCK_QUIET_TIMEOUT_MS).toBe(2_000);
    expect(shouldSpendTipRemountPostUnlockQuiet(state.postUnlockQuiet, true)).toBe(true);
    state.postUnlockQuiet = clearTipRemountPostUnlockQuiet();
    expect(shouldForceSpendTipRemountPostUnlockQuiet(true, true, false)).toBe(true);

    // paint-sync clear → geom-epoch flush (533/534)
    state.step = 'geom-epoch-flush';
    expect(shouldApplyTipRemountPaintSyncHoldClear(
      state.paintSyncToken,
      state.paintSyncToken,
    )).toBe(true);
    const cancelled = nextTipRemountPaintSyncHoldToken(state.paintSyncToken);
    expect(shouldApplyTipRemountPaintSyncHoldClear(
      state.paintSyncToken,
      cancelled,
    )).toBe(false);
    expect(shouldFlushDeferredTipRemountGeomEpochAfterPaintSyncHold(
      true,
      state.deferredEpochBump,
    )).toBe(true);
    state.paintSyncHold = clearTipRemountPaintSyncHold();
    state.deferredEpochBump = false;

    state.step = 'live';
    expect(state.step).toBe(TIP_REMOUNT_CHROME_RELEASE_SEQUENCE.at(-1));
    expect(state.chromeSuppressed).toBe(false);
    expect(state.paintSyncHold).toBe(false);
    expect(state.unlockGate).toBe(false);
    expect(state.postUnlockQuiet).toBe(false);
    expect(state.deferredEpochBump).toBe(false);
  });
});
