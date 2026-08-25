/**
 * Tip remount user-perception smoke pins (loop 500/501/506).
 * Encodes the Manual Edit tip-yield → soft-land → absorb checklist as
 * falsifiable helper/constant + FileViewer wiring assertions.
 * CI fail-fast: `pnpm --filter @open-design/web test:tip-remount-smoke`.
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
  shouldReleaseTipRemountChromeAfterFailedFitSettleRemasure,
  shouldReleaseTipRemountChromeAfterFitSettleRemasure,
  shouldReleaseTipRemountChromeAfterResizeGestureEnds,
  shouldRefreshHostMetricsBeforeTipRemountGeometryApply,
  shouldRefreshHostMetricsAfterTipRemountMultiRemasure,
  shouldBumpGeomEpochAfterTipRemountMultiRemasure,
  shouldPreferPendingDraftOverAbsorbInspectorSettle,
  shouldSettleInspectorStylesOnPostExitAbsorb,
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
  tipRemountApplyLastGoodMatchesHostPaintResult,
  shouldApplyTipRemountMemberLastHostRectSeedRetry,
  expectedTipRemountUnionPaintBearingCount,
  shouldCancelTipRemountMemberLastHostRectSeedRetryOnSelectionBoundary,
  shouldPruneTipRemountMemberLastHostRectsOnSelectionCommit,
  pruneTipRemountMemberLastHostRectsToSelection,
  countTipRemountSeededLastGoodForSelection,
  shouldRefreshTipRemountChromeAfterMemberLastHostRectSeedRetry,
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
  shouldCatchUpHostMetricsWhenDeckNudgeRemasureThrottled,
  shouldRetryTipRemountSiblingMeasure,
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
const multiOverlay = readFileSync(
  resolve(import.meta.dirname, '../../src/components/ManualEditMultiSelectOverlay.tsx'),
  'utf8',
);
const webPackageJson = readFileSync(
  resolve(import.meta.dirname, '../../package.json'),
  'utf8',
);
const freezeSource = readFileSync(
  resolve(import.meta.dirname, '../../src/edit-mode/manual-edit-freeze.ts'),
  'utf8',
);

describe('manual-edit tip remount smoke (500/501/506)', () => {
  it('pins tip remount smoke script for CI fail-fast (506)', () => {
    expect(webPackageJson).toContain('"test:tip-remount-smoke"');
    expect(webPackageJson).toContain('manual-edit-tip-remount-smoke.test.ts');
    expect(webPackageJson).toContain('manual-edit-tip-soft-land-absorb-sequence.test.ts');
    expect(webPackageJson).toContain('manual-edit-tip-chrome-release-sequence.test.ts');
    expect(webPackageJson).toContain('manual-edit-tip-post-protect-chrome-cross-walk.test.ts');
    expect(webPackageJson).toContain('manual-edit-tip-deck-nudge-follow-chrome-race.test.ts');
    expect(freezeSource).not.toContain('spendTipPostSoftLandExitLatch');
    expect(freezeSource).toContain('Tip remount index (569)');
    expect(freezeSource).toContain('docs-teamver/49_tip_remount');
    expect(freezeSource).toContain('hostPaintRectForManualEditSelectionCommit');
    expect(freezeSource).toContain('resolveTipRemountRefreshMissAction');
    expect(freezeSource).toContain('resolveTipRemountOverlayHostPaintRect');
    expect(freezeSource).toContain('resolveTipRemountHostPaintRectResult');
    expect(freezeSource).toContain('shouldRefreshHostPaintOnManualEditSelectionCommit');
    expect(freezeSource).toContain('shouldSeedTipRemountMemberLastHostRectsOnMultiCommit');
    expect(freezeSource).toContain('shouldRetryTipRemountMemberLastHostRectSeed');
    expect(freezeSource).toContain('shouldApplyTipRemountMemberLastHostRectSeedRetry');
    expect(freezeSource).toContain('shouldCancelTipRemountMemberLastHostRectSeedRetryOnSelectionBoundary');
    expect(freezeSource).toContain('expectedTipRemountUnionPaintBearingCount');
    expect(freezeSource).toContain('shouldPruneTipRemountMemberLastHostRectsOnSelectionCommit');
    expect(freezeSource).toContain('pruneTipRemountMemberLastHostRectsToSelection');
    expect(freezeSource).toContain('countTipRemountSeededLastGoodForSelection');
    expect(freezeSource).toContain('shouldRefreshTipRemountChromeAfterMemberLastHostRectSeedRetry');
    expect(freezeSource).toContain('tipRemountApplyLastGoodMatchesHostPaintResult');
    expect(fileViewer).toContain('hostPaintRectForManualEditSelectionCommit');
    expect(fileViewer).toContain('resolveTipRemountRefreshMissAction');
    expect(fileViewer).toContain('resolveTipRemountHostPaintRectResult');
    expect(fileViewer).toContain('shouldRefreshHostPaintOnManualEditSelectionCommit');
    expect(fileViewer).toContain('shouldSeedTipRemountMemberLastHostRectsOnMultiCommit');
    expect(fileViewer).toContain('shouldRetryTipRemountMemberLastHostRectSeed');
    expect(fileViewer).toContain('shouldApplyTipRemountMemberLastHostRectSeedRetry');
    expect(fileViewer).toContain('shouldCancelTipRemountMemberLastHostRectSeedRetryOnSelectionBoundary');
    expect(fileViewer).toContain('expectedTipRemountUnionPaintBearingCount');
    expect(fileViewer).toContain('shouldPruneTipRemountMemberLastHostRectsOnSelectionCommit');
    expect(fileViewer).toContain('pruneTipRemountMemberLastHostRectsToSelection');
    expect(fileViewer).toContain('countTipRemountSeededLastGoodForSelection');
    expect(fileViewer).toContain('shouldRefreshTipRemountChromeAfterMemberLastHostRectSeedRetry');
    expect(fileViewer).toContain('seedTipRemountMemberLastHostRectsForSelection');
    expect(fileViewer).toContain('scheduleTipRemountMemberLastHostRectSeedRetry');
    expect(fileViewer).toContain('tipRemountSeededLastGoodCount');
    expect(multiOverlay).toContain('expectedTipRemountUnionPaintBearingCount');
    expect(multiOverlay).toContain('tipRemountSeededLastGoodCount');
    expect(fileViewer).toContain('clearTipPostSoftLandExitLatch');
    expect(fileViewer).not.toContain('spendTipPostSoftLandExitLatch');
    const sequenceFixtures = readFileSync(
      resolve(import.meta.dirname, './tip-remount-sequence-fixtures.ts'),
      'utf8',
    );
    expect(sequenceFixtures).toContain('advanceTipPostProtectToLive');
    expect(sequenceFixtures).toContain('advanceTipChromeReleaseToLive');
  });

  it('clears follow on od-edit-targets selection-ids change (508)', () => {
    expect(fileViewer).toContain('shouldClearTipPostProtectOnOdEditTargetsSelectionIdsChange');
    expect(fileViewer).toContain('Membership change must also drop deck-nudge follow');
    expect(fileViewer).toContain('manualEditTipPostAbsorbInspectorQuietRef');
  });

  it('arms post-absorb inspector quiet after absorb spend (509)', () => {
    expect(fileViewer).toContain('shouldArmTipPostAbsorbInspectorQuiet');
    expect(fileViewer).toContain('shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet');
    expect(fileViewer).toContain('shouldTreatPostAbsorbQuietAsTipProtect');
    expect(fileViewer).toContain('clearTipPostAbsorbInspectorQuiet');
    expect(freezeSource).toContain('shouldArmTipPostAbsorbInspectorQuiet');
  });

  it('settles inspector source-only on absorb so tip draft does not stick (511)', () => {
    expect(fileViewer).toContain('shouldSettleInspectorStylesOnPostExitAbsorb');
    expect(fileViewer).toContain('settleAbsorbInspector');
    expect(freezeSource).toContain('shouldSettleInspectorStylesOnPostExitAbsorb');
  });

  it('keeps pending draft over absorb settle (514)', () => {
    expect(shouldPreferPendingDraftOverAbsorbInspectorSettle(true, true)).toBe(true);
    expect(shouldSettleInspectorStylesOnPostExitAbsorb(true, false, true)).toBe(false);
    expect(fileViewer).toContain('shouldPreferPendingDraftOverAbsorbInspectorSettle');
    expect(fileViewer).toContain('Pending draft wins');
  });

  it('refreshes host metrics before geometry after chrome release (513)', () => {
    expect(shouldRefreshHostMetricsBeforeTipRemountGeometryApply(true, false, 900)).toBe(true);
    expect(shouldRefreshHostMetricsBeforeTipRemountGeometryApply(true, true, 150)).toBe(false);
    expect(fileViewer).toContain('shouldRefreshHostMetricsBeforeTipRemountGeometryApply');
    expect(fileViewer).toContain('Measure first — apply only after host metrics refresh');
  });

  it('refreshes host metrics for single+multi and bumps epoch for multi (515)', () => {
    expect(shouldRefreshHostMetricsAfterTipRemountMultiRemasure(1, true)).toBe(true);
    expect(shouldBumpGeomEpochAfterTipRemountMultiRemasure(2, true)).toBe(true);
    expect(shouldBumpGeomEpochAfterTipRemountMultiRemasure(1, true)).toBe(false);
    expect(fileViewer).toContain('shouldBumpGeomEpochAfterTipRemountMultiRemasure');
  });

  it('defers late geometry while pointer is over chrome (516)', () => {
    expect(shouldDeferTipRemountPostReleaseGeometryApply(false, 900, true)).toBe(true);
    expect(shouldDeferTipRemountPostReleaseGeometryApply(false, 900, false)).toBe(false);
    expect(shouldDeferTipRemountPostReleaseGeometryApply(false, 900, false, undefined, true)).toBe(true);
    expect(fileViewer).toContain('shouldDeferTipRemountPostReleaseGeometryApply');
    expect(fileViewer).toContain('onChromePointerHoverChange');
    expect(fileViewer).toContain('manualEditTipChromePointerHoverRef');
  });

  it('keeps only latest deferred geometry payload (519)', () => {
    expect(shouldReplaceDeferredTipRemountGeometryPayload(true, true)).toBe(true);
    expect(shouldInvalidateDeferredTipRemountGeometryOnImmediateApply(true, true)).toBe(true);
    expect(fileViewer).toContain('shouldReplaceDeferredTipRemountGeometryPayload');
    expect(fileViewer).toContain('manualEditTipDeferredGeometryPayloadRef');
    expect(fileViewer).toContain('shouldInvalidateDeferredTipRemountGeometryOnImmediateApply');
  });

  it('gates chrome until pointerup after unlock (520/522)', () => {
    expect(shouldArmTipRemountChromeUnlockPointerGate(true, false, true)).toBe(true);
    expect(shouldArmTipRemountChromeUnlockPointerGate(true, false, false, true)).toBe(true);
    expect(shouldDisableManualEditChromeForTipRemountUnlockGate(false, true)).toBe(true);
    expect(fileViewer).toContain('shouldArmTipRemountChromeUnlockPointerGate');
    expect(fileViewer).toContain('shouldDisableManualEditChromeForTipRemountUnlockGate');
    expect(fileViewer).toContain('manualEditTipChromeUnlockPointerGate');
    expect(fileViewer).toContain('manualEditPointerButtonsDownRef');
    expect(fileViewer).toContain('releaseTipRemountChromeSuppress');
  });

  it('flushes deferred geometry before unlock gate clear on pointerup (525)', () => {
    expect(shouldFlushDeferredTipRemountGeometryBeforeUnlockGateClear(true, true)).toBe(true);
    expect(shouldFlushDeferredTipRemountGeometryBeforeUnlockGateClear(false, true)).toBe(false);
    expect(fileViewer).toContain('shouldFlushDeferredTipRemountGeometryBeforeUnlockGateClear');
    expect(fileViewer).toContain('flushDeferredTipRemountGeometryRef');
  });

  it('arms post-unlock quiet so first remasure does not re-defer (528)', () => {
    expect(shouldArmTipRemountPostUnlockQuiet(true)).toBe(true);
    expect(shouldSpendTipRemountPostUnlockQuiet(true, true)).toBe(true);
    expect(clearTipRemountPostUnlockQuiet()).toBe(false);
    expect(shouldDeferTipRemountPostReleaseGeometryApply(false, 900, true, undefined, false, true)).toBe(false);
    expect(shouldArmTipRemountChromeUnlockPointerGate(true, false, true, false, true)).toBe(false);
    expect(fileViewer).toContain('shouldArmTipRemountPostUnlockQuiet');
    expect(fileViewer).toContain('manualEditTipPostUnlockQuietRef');
  });

  it('force-spends post-unlock quiet on follow-end or timeout (531)', () => {
    expect(shouldForceSpendTipRemountPostUnlockQuiet(true, true, false)).toBe(true);
    expect(shouldForceSpendTipRemountPostUnlockQuiet(true, false, true)).toBe(true);
    expect(TIP_REMOUNT_POST_UNLOCK_QUIET_TIMEOUT_MS).toBe(2_000);
    expect(fileViewer).toContain('shouldForceSpendTipRemountPostUnlockQuiet');
    expect(fileViewer).toContain('clearTipRemountPostUnlockQuietState');
    expect(fileViewer).toContain('TIP_REMOUNT_POST_UNLOCK_QUIET_TIMEOUT_MS');
    expect(fileViewer).toContain("addEventListener('blur'");
  });

  it('reuses last host rect on tip remount measure miss (521/523)', () => {
    expect(shouldReuseLastHostRectOnTipRemountMeasureMiss(true, false, true)).toBe(true);
    expect(fileViewer).toContain('resolveTipRemountHostPaintRectResult');
    expect(fileViewer).toContain('manualEditTipLastHostRectByIdRef');
    expect(fileViewer).toContain('resolveTipRemountHostPaintRect');
  });

  it('retains current host paint on miss during paint-sync hold (538)', () => {
    expect(shouldRetainCurrentHostPaintOnTipRemountPaintMiss(true, false, true)).toBe(true);
    expect(shouldReuseLastHostRectOnTipRemountMeasureMiss(false, false, true, true)).toBe(true);
    // FileViewer routes retain through resolveTipRemountRefreshMissAction (549).
    expect(resolveTipRemountRefreshMissAction(false, true, false, true, false))
      .toBe('retain-current');
    expect(fileViewer).toContain('resolveTipRemountRefreshMissAction');
  });

  it('seeds and applies last-good from layout-effect tip paint (543)', () => {
    expect(shouldSeedTipRemountLastHostRectFromLivePaint(true, false, true)).toBe(true);
    expect(shouldApplyTipRemountLastHostRectOnLayoutPaintMiss(
      false, true, false, false, true,
    )).toBe(true);
    expect(fileViewer).toContain('shouldSeedTipRemountLastHostRectFromLivePaint');
    expect(fileViewer).toContain('shouldApplyTipRemountLastHostRectOnLayoutPaintMiss');
  });

  it('audits hostPaint null sites; tip retain + selection-commit last-good (546)', () => {
    // Intentional nulls: mode-exit, no-selectedId, refresh(!id), unprotected
    // refresh miss, clear-selection. Selection commit must not be among them.
    const nullCalls = fileViewer.match(/setManualEditHostPaintRect\(null\)/g) ?? [];
    expect(nullCalls).toHaveLength(5);
    expect(hostPaintRectForManualEditSelectionCommit(
      true, false, { x: 10, y: 20, width: 30, height: 40 },
    )).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(hostPaintRectForManualEditSelectionCommit(false, false, {
      x: 10, y: 20, width: 30, height: 40,
    })).toBeNull();
    expect(shouldRetainCurrentHostPaintOnTipRemountPaintMiss(false, false, true, true))
      .toBe(true);
    expect(fileViewer).toContain('hostPaintRectForManualEditSelectionCommit');
  });

  it('pins refresh-miss order: last-good → retain → force-keep → clear (549/550)', () => {
    expect(resolveTipRemountRefreshMissAction(true, false, true, true, true))
      .toBe('apply-last-good');
    expect(resolveTipRemountRefreshMissAction(true, false, false, true, true))
      .toBe('retain-current');
    expect(resolveTipRemountRefreshMissAction(false, false, false, true, true))
      .toBe('keep-force');
    expect(resolveTipRemountRefreshMissAction(false, false, false, false, false))
      .toBe('clear');
    // Selection-commit seed then refresh miss stays on last-good, not force-keep.
    const seeded = hostPaintRectForManualEditSelectionCommit(
      true, false, { x: 5, y: 6, width: 7, height: 8 },
    );
    expect(seeded).not.toBeNull();
    expect(resolveTipRemountRefreshMissAction(true, false, true, true, true))
      .toBe('apply-last-good');
    expect(fileViewer).toContain('resolveTipRemountRefreshMissAction');
    expect(fileViewer).toContain("missAction === 'apply-last-good'");
  });

  it('refreshes multi selection primary during tip/paint-sync (552)', () => {
    expect(shouldRefreshHostPaintOnManualEditSelectionCommit(1, false, false)).toBe(true);
    expect(shouldRefreshHostPaintOnManualEditSelectionCommit(2, true, false)).toBe(true);
    expect(shouldRefreshHostPaintOnManualEditSelectionCommit(2, false, false)).toBe(false);
    expect(fileViewer).toContain('shouldRefreshHostPaintOnManualEditSelectionCommit');
  });

  it('aligns overlay host paint last-good with refresh-miss apply-last-good (553)', () => {
    const lastGood = { x: 1, y: 2, width: 30, height: 40 };
    expect(resolveTipRemountOverlayHostPaintRect(true, false, null, lastGood))
      .toEqual(lastGood);
    expect(resolveTipRemountRefreshMissAction(true, false, true, false, false))
      .toBe('apply-last-good');
    expect(fileViewer).toContain('resolveTipRemountHostPaintRectResult');
  });

  it('seeds sibling last-good on multi tip selection commit (555)', () => {
    expect(shouldSeedTipRemountMemberLastHostRectsOnMultiCommit(2, true, false)).toBe(true);
    expect(shouldSeedTipRemountMemberLastHostRectsOnMultiCommit(2, false, false)).toBe(false);
    expect(fileViewer).toContain('shouldSeedTipRemountMemberLastHostRectsOnMultiCommit');
    expect(fileViewer).toContain('seedTipRemountMemberLastHostRectsForSelection');
  });

  it('retries multi sibling last-good seed once when incomplete (558)', () => {
    expect(shouldRetryTipRemountMemberLastHostRectSeed(3, 1, true, false, false)).toBe(true);
    expect(shouldRetryTipRemountMemberLastHostRectSeed(3, 3, true, false, false)).toBe(false);
    expect(fileViewer).toContain('shouldRetryTipRemountMemberLastHostRectSeed');
    expect(fileViewer).toContain('scheduleTipRemountMemberLastHostRectSeedRetry');
    expect(fileViewer).toContain('cancelTipRemountMemberLastHostRectSeedRetry');
  });

  it('applies seed retry only when selection ids unchanged (561)', () => {
    expect(shouldApplyTipRemountMemberLastHostRectSeedRetry(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(shouldApplyTipRemountMemberLastHostRectSeedRetry(['a', 'b'], ['a', 'c'])).toBe(false);
    expect(shouldApplyTipRemountMemberLastHostRectSeedRetry(['a', 'b'], ['a'])).toBe(false);
    expect(fileViewer).toContain('shouldApplyTipRemountMemberLastHostRectSeedRetry');
  });

  it('floors union paintBearingCount from sibling seed during tip/paint-sync (562)', () => {
    expect(expectedTipRemountUnionPaintBearingCount(true, false, 3, 2, 1)).toBe(2);
    expect(expectedTipRemountUnionPaintBearingCount(false, true, 3, 2, 0)).toBe(2);
    expect(expectedTipRemountUnionPaintBearingCount(false, false, 3, 2, 1)).toBe(1);
    expect(expectedTipRemountUnionPaintBearingCount(true, false, 2, 2, 2)).toBe(2);
    expect(multiOverlay).toContain('expectedTipRemountUnionPaintBearingCount');
    expect(fileViewer).toContain('tipRemountSeededLastGoodCount');
  });

  it('cancels pending sibling seed retry on selection boundary (564)', () => {
    expect(shouldCancelTipRemountMemberLastHostRectSeedRetryOnSelectionBoundary(true, true)).toBe(true);
    expect(shouldCancelTipRemountMemberLastHostRectSeedRetryOnSelectionBoundary(true, false)).toBe(false);
    expect(shouldCancelTipRemountMemberLastHostRectSeedRetryOnSelectionBoundary(false, true)).toBe(false);
    expect(fileViewer).toContain('shouldCancelTipRemountMemberLastHostRectSeedRetryOnSelectionBoundary');
    expect(fileViewer).toContain('cancelTipRemountMemberLastHostRectSeedRetry(true)');
  });

  it('prunes last-good cache to selected ids on tip/paint-sync commit (565)', () => {
    expect(shouldPruneTipRemountMemberLastHostRectsOnSelectionCommit(true, false)).toBe(true);
    expect(shouldPruneTipRemountMemberLastHostRectsOnSelectionCommit(false, true)).toBe(true);
    expect(shouldPruneTipRemountMemberLastHostRectsOnSelectionCommit(false, false)).toBe(false);
    const cache = new Map([
      ['a', { x: 0, y: 0, width: 1, height: 1 }],
      ['b', { x: 0, y: 0, width: 1, height: 1 }],
      ['c', { x: 0, y: 0, width: 1, height: 1 }],
    ]);
    expect(pruneTipRemountMemberLastHostRectsToSelection(cache, ['a', 'c'])).toBe(1);
    expect([...cache.keys()].sort()).toEqual(['a', 'c']);
    expect(fileViewer).toContain('pruneTipRemountMemberLastHostRectsToSelection');
  });

  it('counts only valid last-good boxes for the seed floor (568)', () => {
    const cache = new Map([
      ['a', { x: 0, y: 0, width: 2, height: 2 }],
      ['b', { x: 0, y: 0, width: 0, height: 2 }],
      ['c', { x: 0, y: 0, width: 3, height: 3 }],
    ]);
    expect(countTipRemountSeededLastGoodForSelection(cache, ['a', 'b', 'c'])).toBe(2);
    expect(countTipRemountSeededLastGoodForSelection(cache, ['b'])).toBe(0);
    expect(fileViewer).toContain('countTipRemountSeededLastGoodForSelection');
  });

  it('refreshes multi chrome after sibling seed retry newly fills last-good (567)', () => {
    expect(shouldRefreshTipRemountChromeAfterMemberLastHostRectSeedRetry(true, false, 1)).toBe(true);
    expect(shouldRefreshTipRemountChromeAfterMemberLastHostRectSeedRetry(false, true, 2)).toBe(true);
    expect(shouldRefreshTipRemountChromeAfterMemberLastHostRectSeedRetry(true, false, 0)).toBe(false);
    expect(shouldRefreshTipRemountChromeAfterMemberLastHostRectSeedRetry(false, false, 1)).toBe(false);
    expect(fileViewer).toContain('shouldRefreshTipRemountChromeAfterMemberLastHostRectSeedRetry');
    expect(fileViewer).toContain('setManualEditGeomEpoch');
  });

  it('uses single host-paint entry with live seed (556)', () => {
    expect(resolveTipRemountHostPaintRectResult(
      true, false, { x: 1, y: 2, width: 3, height: 4 }, null,
    )).toEqual({
      paint: { x: 1, y: 2, width: 3, height: 4 },
      seedLastGood: { x: 1, y: 2, width: 3, height: 4 },
    });
    expect(resolveTipRemountHostPaintRectResult(
      true, false, null, { x: 5, y: 6, width: 7, height: 8 },
    )).toEqual({
      paint: { x: 5, y: 6, width: 7, height: 8 },
      seedLastGood: null,
    });
    expect(fileViewer).toContain('resolveTipRemountHostPaintRectResult');
  });

  it('pins apply-last-good to the same last-good as host-paint Result (559)', () => {
    const lastGood = { x: 10, y: 20, width: 30, height: 40 };
    expect(tipRemountApplyLastGoodMatchesHostPaintResult(true, false, lastGood)).toBe(true);
    expect(tipRemountApplyLastGoodMatchesHostPaintResult(false, true, lastGood)).toBe(true);
    expect(tipRemountApplyLastGoodMatchesHostPaintResult(false, false, lastGood)).toBe(true);
    expect(tipRemountApplyLastGoodMatchesHostPaintResult(true, false, null)).toBe(true);
    expect(freezeSource).toContain('tipRemountApplyLastGoodMatchesHostPaintResult');
  });

  it('clears tip last-good host rect cache when session idle (524)', () => {
    expect(shouldClearTipRemountLastHostRectCache(false, false, false)).toBe(true);
    expect(shouldClearTipRemountLastHostRectCache(false, true, false)).toBe(false);
    expect(fileViewer).toContain('shouldClearTipRemountLastHostRectCache');
    expect(fileViewer).toContain('maybeClearTipRemountLastHostRectCache');
  });

  it('trusts tip remount host paint despite composed stale (526)', () => {
    expect(shouldTrustTipRemountHostPaintDespiteComposedStale(true, true)).toBe(true);
    expect(shouldTrustTipRemountHostPaintDespiteComposedStale(false, true)).toBe(false);
    expect(fileViewer).toContain('shouldTrustTipRemountHostPaintDespiteComposedStale');
    expect(fileViewer).toContain('trustHostPaintDespiteStale');
  });

  it('omits composed-only members from partial tip remount union (529)', () => {
    expect(shouldOmitComposedMembersFromTipRemountPartialUnion(true, 3, 1)).toBe(true);
    expect(shouldOmitComposedMembersFromTipRemountPartialUnion(true, 2, 2)).toBe(false);
    expect(multiOverlay).toContain('shouldOmitComposedMembersFromTipRemountPartialUnion');
    expect(multiOverlay).toContain('stabilizePartialPaintUnion');
  });

  it('latches previous union min-size while partial omit (532)', () => {
    expect(shouldLatchTipRemountPartialUnionMinSize(true, true, true)).toBe(true);
    expect(resolveTipRemountPartialUnionWithMinSizeLatch(
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 20, y: 0, width: 30, height: 50 },
    )).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(multiOverlay).toContain('shouldLatchTipRemountPartialUnionMinSize');
    expect(multiOverlay).toContain('tipRemountPartialUnionLatchRef');
  });

  it('clears min-size latch on full paint coverage (535)', () => {
    expect(shouldClearTipRemountPartialUnionMinSizeLatch(true, 3, 3)).toBe(true);
    expect(shouldClearTipRemountPartialUnionMinSizeLatch(true, 3, 1)).toBe(false);
    expect(shouldClearTipRemountPartialUnionMinSizeLatch(false, 3, 1)).toBe(true);
    expect(multiOverlay).toContain('shouldClearTipRemountPartialUnionMinSizeLatch');
  });

  it('invalidates min-size latch on membership change or zero paint (541)', () => {
    expect(shouldClearTipRemountPartialUnionMinSizeLatch(true, 3, 0)).toBe(true);
    expect(shouldInvalidateTipRemountPartialUnionLatchOnMembershipChange(
      tipRemountPartialUnionLatchMemberKey(['a', 'b']),
      tipRemountPartialUnionLatchMemberKey(['a', 'c']),
    )).toBe(true);
    expect(multiOverlay).toContain('tipRemountPartialUnionLatchMemberKey');
    expect(multiOverlay).toContain('shouldInvalidateTipRemountPartialUnionLatchOnMembershipChange');
  });

  it('holds host paint trust for inert→interactive paint sync (530)', () => {
    expect(shouldArmTipRemountPaintSyncHold(true, false)).toBe(true);
    expect(shouldTrustTipRemountHostPaintDespiteComposedStale(false, true, true)).toBe(true);
    expect(clearTipRemountPaintSyncHold()).toBe(false);
    expect(fileViewer).toContain('shouldArmTipRemountPaintSyncHold');
    expect(fileViewer).toContain('manualEditTipPaintSyncHold');
  });

  it('cancels paint-sync nested rAF via generation token (534)', () => {
    let token = 0;
    token = nextTipRemountPaintSyncHoldToken(token);
    expect(shouldApplyTipRemountPaintSyncHoldClear(token, token)).toBe(true);
    const cancelled = nextTipRemountPaintSyncHoldToken(token);
    expect(shouldApplyTipRemountPaintSyncHoldClear(token, cancelled)).toBe(false);
    expect(fileViewer).toContain('nextTipRemountPaintSyncHoldToken');
    expect(fileViewer).toContain('shouldApplyTipRemountPaintSyncHoldClear');
    expect(fileViewer).toContain('cancelTipRemountPaintSyncHoldRaf');
  });

  it('defers geom-epoch bump until paint-sync hold clears (533)', () => {
    expect(shouldDeferTipRemountGeomEpochBumpForPaintSync(true, false)).toBe(true);
    expect(shouldDeferTipRemountGeomEpochBumpForPaintSync(false, true)).toBe(true);
    expect(shouldFlushDeferredTipRemountGeomEpochAfterPaintSyncHold(true, true)).toBe(true);
    expect(fileViewer).toContain('shouldDeferTipRemountGeomEpochBumpForPaintSync');
    expect(fileViewer).toContain('flushDeferredTipRemountGeomEpochAfterPaintSync');
    expect(fileViewer).toContain('chromeReleasePendingThisFrame');
    expect(fileViewer).toContain('manualEditTipDeferredGeomEpochBumpRef.current = false');
  });

  it('pins tip remount paint vs pointer tracks after chrome-release (540)', () => {
    expect(TIP_REMOUNT_POST_PROTECT_SEQUENCE[0]).toBe('sticky-clear');
    expect(TIP_REMOUNT_POST_PROTECT_SEQUENCE.at(-1)).toBe('live');
    expect([...TIP_REMOUNT_CHROME_RELEASE_PREFIX]).toEqual([
      'chrome-suppress',
      'fit-remasure',
      'chrome-release',
    ]);
    expect(TIP_REMOUNT_PAINT_SYNC_TRACK.indexOf('paint-sync-hold')).toBeLessThan(
      TIP_REMOUNT_PAINT_SYNC_TRACK.indexOf('geom-epoch-flush'),
    );
    expect(TIP_REMOUNT_POINTER_UNLOCK_TRACK.indexOf('pointerup-deferred-flush')).toBeLessThan(
      TIP_REMOUNT_POINTER_UNLOCK_TRACK.indexOf('post-unlock-quiet'),
    );
    // Epoch is on the paint track — must not be asserted after quiet.
    expect(TIP_REMOUNT_PAINT_SYNC_TRACK).toContain('geom-epoch-flush');
    expect(TIP_REMOUNT_POINTER_UNLOCK_TRACK).not.toContain('geom-epoch-flush');
    expect(freezeSource).toContain('TIP_REMOUNT_PAINT_SYNC_TRACK');
    expect(freezeSource).toContain('TIP_REMOUNT_POINTER_UNLOCK_TRACK');
    expect(freezeSource).toContain('TIP_REMOUNT_CHROME_RELEASE_SEQUENCE');
  });

  it('releases grace safety/expiry via paint-sync path (542)', () => {
    expect(shouldReleaseTipRemountChromeViaPaintSyncOnGraceClear('safety')).toBe(true);
    expect(shouldReleaseTipRemountChromeViaPaintSyncOnGraceClear('selection')).toBe(false);
    expect(fileViewer).toContain('shouldReleaseTipRemountChromeViaPaintSyncOnGraceClear');
    expect(fileViewer).toContain('releaseTipRemountChromeSuppress(true)');
  });

  it('pins 522–524 FileViewer wiring on tip remount path (527)', () => {
    expect(fileViewer).toContain('manualEditPointerButtonsDownRef');
    expect(fileViewer).toContain('resolveTipRemountHostPaintRect');
    expect(fileViewer).toContain('maybeClearTipRemountLastHostRectCache');
    expect(fileViewer).toContain('manualEditTipLastHostRectByIdRef');
    expect(fileViewer).toContain('shouldArmTipRemountChromeUnlockPointerGate');
    expect(fileViewer).toContain('shouldClearTipRemountLastHostRectCache');
    expect(fileViewer).toContain('resolveTipRemountHostPaintRectResult');
  });

  it('catch-up host metrics when follow remasure is throttled (517)', () => {
    expect(shouldCatchUpHostMetricsWhenDeckNudgeRemasureThrottled(true, true, true, false))
      .toBe(true);
    expect(fileViewer).toContain('shouldCatchUpHostMetricsWhenDeckNudgeRemasureThrottled');
    expect(fileViewer).toContain('Still catch up scale/offset');
  });

  it('retries partial multi sibling measure once (518)', () => {
    expect(shouldRetryTipRemountSiblingMeasure(3, 3, 1)).toBe(true);
    expect(shouldRetryTipRemountSiblingMeasure(3, 3, 3)).toBe(false);
    expect(fileViewer).toContain('shouldRetryTipRemountSiblingMeasure');
    expect(fileViewer).toContain('allowSiblingRetry');
  });

  it('releases chrome at 400ms even when fit remasure applied nothing (512)', () => {
    expect(fileViewer).toContain('shouldReleaseTipRemountChromeAfterFailedFitSettleRemasure');
    expect(freezeSource).toContain('shouldReleaseTipRemountChromeAfterFailedFitSettleRemasure');
    expect(shouldReleaseTipRemountChromeAfterFailedFitSettleRemasure(true, false, 400)).toBe(true);
    expect(shouldReleaseTipRemountChromeAfterFailedFitSettleRemasure(true, true, 400)).toBe(false);
  });

  it('defers follow-end chrome release while safety timeout pending (510)', () => {
    expect(fileViewer).toContain('shouldDeferTipRemountChromeReleaseAfterFollowEndBlockedBySafety');
    expect(fileViewer).toContain('shouldFlushDeferredTipRemountChromeReleaseAfterSafety');
    expect(fileViewer).toContain('manualEditTipFollowChromeReleaseDeferredRef');
    expect(TIP_REMOUNT_DECK_NUDGE_FOLLOW_MS).toBeGreaterThan(TIP_REMOUNT_FIT_SETTLE_LATCH_MS);
  });

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
