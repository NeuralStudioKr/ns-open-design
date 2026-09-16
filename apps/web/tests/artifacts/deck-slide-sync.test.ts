import { describe, expect, it } from 'vitest';

import { reconcileReportedDeckSlideState } from '../../src/artifacts/deck-slide-sync';

describe('reconcileReportedDeckSlideState', () => {
  it('ignores a stale iframe report after duplicate until counts match', () => {
    const decision = reconcileReportedDeckSlideState({
      reportedActive: 2,
      reportedCount: 8,
      htmlCount: 9,
      pending: { active: 3, count: 9 },
    });
    expect(decision.accept).toBe(false);
    expect(decision.active).toBe(3);
    expect(decision.count).toBe(9);
    expect(decision.clearPending).toBe(false);
  });

  it('ignores a matching count that is still painted on the wrong page', () => {
    const decision = reconcileReportedDeckSlideState({
      reportedActive: 0,
      reportedCount: 9,
      htmlCount: 9,
      pending: { active: 3, count: 9 },
    });
    expect(decision.accept).toBe(false);
    expect(decision.active).toBe(3);
    expect(decision.clearPending).toBe(false);
  });

  it('accepts the iframe once it reports the post-delete count', () => {
    const decision = reconcileReportedDeckSlideState({
      reportedActive: 4,
      reportedCount: 7,
      htmlCount: 7,
      pending: { active: 4, count: 7 },
    });
    expect(decision.accept).toBe(true);
    expect(decision.active).toBe(4);
    expect(decision.count).toBe(7);
    expect(decision.clearPending).toBe(true);
  });

  it('uses HTML section count when the bridge undercounts and no mutation is pending', () => {
    const decision = reconcileReportedDeckSlideState({
      reportedActive: 8,
      reportedCount: 9,
      htmlCount: 10,
      pending: null,
    });
    expect(decision.accept).toBe(true);
    expect(decision.count).toBe(10);
    expect(decision.active).toBe(8);
  });

  it('clamps a stale high index when HTML is shorter than the report and pending expired', () => {
    const decision = reconcileReportedDeckSlideState({
      reportedActive: 8,
      reportedCount: 9,
      htmlCount: 7,
      pending: null,
    });
    expect(decision.accept).toBe(true);
    expect(decision.count).toBe(7);
    expect(decision.active).toBe(6);
  });
});
