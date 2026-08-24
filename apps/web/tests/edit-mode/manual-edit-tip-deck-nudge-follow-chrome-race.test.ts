/**
 * Deck-nudge follow-end vs tip-remount chrome safety timeout race (510).
 */
import { describe, expect, it } from 'vitest';
import {
  TIP_REMOUNT_DECK_NUDGE_FOLLOW_MS,
  TIP_REMOUNT_FIT_SETTLE_LATCH_MS,
  shouldDeferTipRemountChromeReleaseAfterFollowEndBlockedBySafety,
  shouldFlushDeferredTipRemountChromeReleaseAfterSafety,
  shouldReleaseTipRemountChromeWhenDeckNudgeFollowEnds,
} from '../../src/edit-mode/manual-edit-freeze';

describe('manual-edit tip deck-nudge follow chrome race (510)', () => {
  it('keeps follow window after fit-settle safety window', () => {
    // Production timings: safety ~latch+20 ≪ follow — race is rare but guarded.
    expect(TIP_REMOUNT_DECK_NUDGE_FOLLOW_MS).toBeGreaterThan(TIP_REMOUNT_FIT_SETTLE_LATCH_MS);
  });

  it('blocks follow-end chrome release while safety timeout is pending', () => {
    expect(shouldReleaseTipRemountChromeWhenDeckNudgeFollowEnds(true, true, true))
      .toBe(false);
    expect(shouldDeferTipRemountChromeReleaseAfterFollowEndBlockedBySafety(
      true, true, true,
    )).toBe(true);
  });

  it('releases immediately when follow ends and safety is already gone', () => {
    expect(shouldReleaseTipRemountChromeWhenDeckNudgeFollowEnds(true, true, false))
      .toBe(true);
    expect(shouldDeferTipRemountChromeReleaseAfterFollowEndBlockedBySafety(
      true, true, false,
    )).toBe(false);
  });

  it('flushes deferred release after safety callback nulls the pending ref', () => {
    // Sequence: follow-end blocked → defer → safety fires (pending=false) → flush
    const chromeSuppressed = true;
    const followEnded = true;
    let safetyPending = true;
    let deferred = false;

    expect(shouldReleaseTipRemountChromeWhenDeckNudgeFollowEnds(
      chromeSuppressed, followEnded, safetyPending,
    )).toBe(false);
    deferred = shouldDeferTipRemountChromeReleaseAfterFollowEndBlockedBySafety(
      chromeSuppressed, followEnded, safetyPending,
    );
    expect(deferred).toBe(true);

    // Safety timeout callback runs and nulls the pending ref.
    safetyPending = false;
    expect(shouldFlushDeferredTipRemountChromeReleaseAfterSafety(
      deferred, chromeSuppressed, safetyPending,
    )).toBe(true);
  });

  it('does not flush deferred release when chrome already released', () => {
    expect(shouldFlushDeferredTipRemountChromeReleaseAfterSafety(true, false, false))
      .toBe(false);
  });
});
