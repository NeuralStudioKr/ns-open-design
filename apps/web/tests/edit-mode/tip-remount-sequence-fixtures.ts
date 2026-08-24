/**
 * Shared tip-remount sequence walk fixtures (547).
 * Soft-land, chrome-release, and post-protect×chrome cross-walk tests import
 * these so catalog counts / helper order cannot drift apart.
 */
import {
  TIP_POST_STICKY_SOFT_LAND_CATALOGS,
  TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
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

export type TipPostProtectWalkState = {
  softLandRemaining: number;
  exitLatch: boolean;
  absorb: boolean;
  quiet: boolean;
};

export function createTipPostProtectSoftLandState(): TipPostProtectWalkState {
  if (!shouldArmTipPostStickySoftLand(true)) {
    throw new Error('expected sticky clear to arm soft-land');
  }
  return {
    softLandRemaining: TIP_POST_STICKY_SOFT_LAND_CATALOGS,
    exitLatch: false,
    absorb: false,
    quiet: false,
  };
}

/**
 * Walk soft-land catalogs → exit latch → absorb → post-absorb quiet → live.
 * Returns the live (disarmed) post-protect state.
 */
export function advanceTipPostProtectToLive(
  initial: TipPostProtectWalkState = createTipPostProtectSoftLandState(),
): TipPostProtectWalkState {
  let state = { ...initial };
  if (!tipRemountPostProtectArmed({ softLandRemaining: state.softLandRemaining })) {
    throw new Error('expected soft-land to arm post-protect');
  }

  if (!shouldRetainTipSyncedIdentityDuringPostStickySoftLand(
    state.softLandRemaining, false,
  )) {
    throw new Error('expected soft-land retain on first catalog');
  }
  state.softLandRemaining = consumeTipPostStickySoftLandCatalog(
    state.softLandRemaining, false,
  );

  const softLandAtEntry = state.softLandRemaining;
  state.softLandRemaining = consumeTipPostStickySoftLandCatalog(
    softLandAtEntry, false,
  );
  if (!shouldArmTipPostSoftLandExitLatch(
    softLandAtEntry, state.softLandRemaining, false, false,
  )) {
    throw new Error('expected exit latch after soft-land catalogs');
  }
  state.exitLatch = true;
  if (!shouldRetainTipSyncedIdentityDuringPostSoftLandExitLatch(
    state.exitLatch, false,
  )) {
    throw new Error('expected exit-latch retain');
  }
  if (!shouldArmTipPostExitLatchMixedAbsorb(state.exitLatch, false)) {
    throw new Error('expected absorb arm from exit latch');
  }
  state.exitLatch = clearTipPostSoftLandExitLatch();
  state.absorb = true;
  if (!shouldTreatPostExitAbsorbAsTipProtect(state.absorb)) {
    throw new Error('expected absorb tip-protect');
  }
  if (!shouldArmTipPostAbsorbInspectorQuiet(state.absorb, false)) {
    throw new Error('expected post-absorb quiet arm');
  }
  state.absorb = false;
  state.quiet = true;
  if (!shouldTreatPostAbsorbQuietAsTipProtect(state.quiet)) {
    throw new Error('expected quiet tip-protect');
  }
  if (!shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet(
    false, state.quiet,
  )) {
    throw new Error('expected Mixed skip during quiet');
  }
  state.quiet = clearTipPostAbsorbInspectorQuiet();

  if (tipRemountPostProtectArmed({
    softLandRemaining: state.softLandRemaining,
    exitLatch: state.exitLatch,
    absorb: state.absorb,
    postAbsorbQuiet: state.quiet,
  })) {
    throw new Error('expected post-protect disarmed at live');
  }
  return state;
}

export type TipChromeReleaseWalkState = {
  chromeSuppressed: boolean;
  paintSyncHold: boolean;
  unlockGate: boolean;
  postUnlockQuiet: boolean;
  deferredEpochBump: boolean;
  deferredGeometryPending: boolean;
};

export function createTipChromeSuppressState(): TipChromeReleaseWalkState {
  return {
    chromeSuppressed: true,
    paintSyncHold: false,
    unlockGate: false,
    postUnlockQuiet: false,
    deferredEpochBump: false,
    deferredGeometryPending: false,
  };
}

/** Chrome suppress → fit remasure release → paint-sync hold armed; epoch deferred. */
export function advanceTipChromeReleasePrefix(
  initial: TipChromeReleaseWalkState = createTipChromeSuppressState(),
): TipChromeReleaseWalkState {
  const state = { ...initial };
  if (!shouldReleaseTipRemountChromeAfterFitSettleRemasure(
    state.chromeSuppressed,
    true,
    TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
  )) {
    throw new Error('expected chrome release at fit settle delay');
  }
  if (!shouldDeferTipRemountGeomEpochBumpForPaintSync(false, true)) {
    throw new Error('expected geom-epoch defer while release pending');
  }
  state.deferredEpochBump = true;
  if (!shouldArmTipRemountPaintSyncHold(state.chromeSuppressed, false)) {
    throw new Error('expected paint-sync hold arm at chrome release');
  }
  state.chromeSuppressed = false;
  state.paintSyncHold = true;
  return state;
}

/** Paint track: flush deferred epoch → clear paint-sync hold → live paint side. */
export function advanceTipPaintSyncTrack(
  initial: TipChromeReleaseWalkState,
): TipChromeReleaseWalkState {
  const state = { ...initial };
  if (!shouldFlushDeferredTipRemountGeomEpochAfterPaintSyncHold(
    true,
    state.deferredEpochBump,
  )) {
    throw new Error('expected geom-epoch flush after paint-sync hold');
  }
  state.deferredEpochBump = false;
  state.paintSyncHold = clearTipRemountPaintSyncHold();
  return state;
}

/** Pointer track: unlock gate → deferred flush → post-unlock quiet → live. */
export function advanceTipPointerUnlockTrack(
  initial: TipChromeReleaseWalkState,
): TipChromeReleaseWalkState {
  const state = { ...initial };
  if (!shouldArmTipRemountChromeUnlockPointerGate(
    true, false, true, false, state.postUnlockQuiet,
  )) {
    throw new Error('expected unlock pointer gate arm');
  }
  state.unlockGate = true;
  state.deferredGeometryPending = true;
  if (!shouldFlushDeferredTipRemountGeometryBeforeUnlockGateClear(
    state.unlockGate,
    state.deferredGeometryPending,
  )) {
    throw new Error('expected deferred geometry flush before unlock clear');
  }
  state.deferredGeometryPending = false;
  if (!shouldArmTipRemountPostUnlockQuiet(state.unlockGate)) {
    throw new Error('expected post-unlock quiet arm');
  }
  state.postUnlockQuiet = true;
  state.unlockGate = false;
  if (!shouldSpendTipRemountPostUnlockQuiet(state.postUnlockQuiet, true)) {
    throw new Error('expected post-unlock quiet spend');
  }
  state.postUnlockQuiet = clearTipRemountPostUnlockQuiet();
  return state;
}

/** Full chrome prefix + parallel paint∥pointer tracks to live flags. */
export function advanceTipChromeReleaseToLive(
  initial: TipChromeReleaseWalkState = createTipChromeSuppressState(),
): TipChromeReleaseWalkState {
  const afterPrefix = advanceTipChromeReleasePrefix(initial);
  // Parallel after chrome-release: paint and pointer do not wait on each other.
  const afterPaint = advanceTipPaintSyncTrack(afterPrefix);
  const afterPointer = advanceTipPointerUnlockTrack(afterPrefix);
  return {
    chromeSuppressed: afterPaint.chromeSuppressed,
    paintSyncHold: afterPaint.paintSyncHold,
    deferredEpochBump: afterPaint.deferredEpochBump,
    unlockGate: afterPointer.unlockGate,
    postUnlockQuiet: afterPointer.postUnlockQuiet,
    deferredGeometryPending: afterPointer.deferredGeometryPending,
  };
}
