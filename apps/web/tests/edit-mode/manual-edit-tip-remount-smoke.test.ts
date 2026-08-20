/**
 * Tip remount user-perception smoke pins (loop 500/501).
 * Encodes the Manual Edit tip-yield → soft-land → absorb checklist as
 * falsifiable helper/constant + FileViewer wiring assertions.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TIP_POST_STICKY_SOFT_LAND_CATALOGS,
  TIP_REMOUNT_DECK_NUDGE_FOLLOW_MS,
  TIP_REMOUNT_DECK_NUDGE_REMEASURE_THROTTLE_MS,
  TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
  TIP_REMOUNT_FIT_SETTLE_LATCH_MS,
  TIP_REMOUNT_FIT_SETTLE_REMEASURE_DELAYS_MS,
  shouldAllowOdEditTargetsPendingReseedDuringTipProtect,
  shouldClearManualEditSelectionOnEmptyOdEditTargets,
  shouldClearTipRemountOnManualEditModeExit,
  shouldReleaseTipRemountChromeAfterFitSettleRemasure,
  shouldReleaseTipRemountChromeAfterResizeGestureEnds,
  shouldSkipOdEditTargetsIdentityMixedReseedDuringPostExitAbsorb,
  shouldSkipOdEditTargetsSingleInspectorReseedDuringPostExitAbsorb,
  shouldSkipTipRemountFitSettleRemasureDuringResizeGesture,
  shouldTreatPostExitAbsorbAsTipProtect,
  tipRemountPostProtectArmed,
} from '../../src/edit-mode/manual-edit-freeze';

const fileViewer = readFileSync(
  resolve(import.meta.dirname, '../../src/components/FileViewer.tsx'),
  'utf8',
);

describe('manual-edit tip remount smoke (500/501)', () => {
  it('keeps chrome release at 400ms and latch covering 1600 remasure', () => {
    expect(TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS).toBe(400);
    expect(TIP_REMOUNT_FIT_SETTLE_REMEASURE_DELAYS_MS).toEqual([50, 150, 400, 900, 1600]);
    expect(TIP_REMOUNT_FIT_SETTLE_LATCH_MS).toBeGreaterThanOrEqual(1600);
    expect(shouldReleaseTipRemountChromeAfterFitSettleRemasure(true, true, 400)).toBe(true);
    expect(shouldReleaseTipRemountChromeAfterFitSettleRemasure(true, true, 150)).toBe(false);
    expect(shouldReleaseTipRemountChromeAfterFitSettleRemasure(false, true, 1600)).toBe(false);
  });

  it('soft-land / absorb keep selection through empty catalogs', () => {
    expect(TIP_POST_STICKY_SOFT_LAND_CATALOGS).toBeGreaterThanOrEqual(1);
    expect(shouldTreatPostExitAbsorbAsTipProtect(true)).toBe(true);
    expect(shouldClearManualEditSelectionOnEmptyOdEditTargets(true)).toBe(false);
    expect(shouldClearManualEditSelectionOnEmptyOdEditTargets(false)).toBe(true);
    expect(fileViewer).toContain('tipProtectActive');
    expect(fileViewer).toContain('shouldTreatPostExitAbsorbAsTipProtect');
  });

  it('skips fit remasure mid-resize and releases chrome after gesture', () => {
    expect(shouldSkipTipRemountFitSettleRemasureDuringResizeGesture(true)).toBe(true);
    expect(shouldReleaseTipRemountChromeAfterResizeGestureEnds(true, true, false)).toBe(true);
    expect(fileViewer).toContain('shouldSkipTipRemountFitSettleRemasureDuringResizeGesture');
    expect(fileViewer).toContain('shouldReleaseTipRemountChromeAfterResizeGestureEnds');
  });

  it('clears tip post-protect on mode-exit only when armed', () => {
    expect(shouldClearTipRemountOnManualEditModeExit(false, false)).toBe(false);
    expect(shouldClearTipRemountOnManualEditModeExit(false, true)).toBe(true);
    expect(shouldClearTipRemountOnManualEditModeExit(true, true)).toBe(false);
    expect(tipRemountPostProtectArmed({})).toBe(false);
    expect(tipRemountPostProtectArmed({ softLandRemaining: 2 })).toBe(true);
    expect(tipRemountPostProtectArmed({ absorb: true })).toBe(true);
    expect(fileViewer).toContain('shouldClearTipRemountOnManualEditModeExit');
    expect(fileViewer).toContain('tipRemountPostProtectArmed');
  });

  it('keeps pending drafts reachable during absorb tip-protect (504)', () => {
    // Absorb skip yields to pending drafts.
    expect(shouldSkipOdEditTargetsIdentityMixedReseedDuringPostExitAbsorb(false, true, true))
      .toBe(false);
    expect(shouldSkipOdEditTargetsSingleInspectorReseedDuringPostExitAbsorb(false, true, true))
      .toBe(false);
    // tipProtectActive (incl. absorb) still allows pending field refresh.
    expect(shouldAllowOdEditTargetsPendingReseedDuringTipProtect(true, false, false, true))
      .toBe(true);
    expect(shouldAllowOdEditTargetsPendingReseedDuringTipProtect(true, false, true, true))
      .toBe(true);
    expect(shouldAllowOdEditTargetsPendingReseedDuringTipProtect(false, false, false, true))
      .toBe(false);
    expect(fileViewer).toContain('allowPendingReseed');
    expect(fileViewer).toContain('shouldAllowOdEditTargetsPendingReseedDuringTipProtect');
    expect(fileViewer).toMatch(/shouldAllowOdEditTargetsPendingReseedDuringTipProtect\([\s\S]*tipProtectActive/);
  });

  it('follows late deck nudges without extending chrome-release delay', () => {
    expect(TIP_REMOUNT_DECK_NUDGE_FOLLOW_MS).toBeGreaterThan(TIP_REMOUNT_FIT_SETTLE_LATCH_MS);
    expect(TIP_REMOUNT_DECK_NUDGE_REMEASURE_THROTTLE_MS).toBe(100);
    expect(fileViewer).toContain('manualEditTipDeckNudgeRemasureRafRef');
    expect(fileViewer).toContain('onAfterNudge');
    expect(fileViewer).toContain('clearTipPostSoftLandExitLatch');
  });
});
