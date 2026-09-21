/** Host pager state vs iframe `od:slide-state` after a page-count mutation. */

export type DeckSlideSyncPending = {
  active: number;
  count: number;
};

export type DeckSlideSyncDecision = {
  /** False: report is from the pre-mutation iframe. Do not clobber host index. */
  accept: boolean;
  active: number;
  count: number;
  clearPending: boolean;
};

function positiveInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * Filmstrip HTML section count is the pager SSOT.
 * Until the iframe reports that same count, a structure mutation (duplicate,
 * delete, insert, reorder) must not accept the old `active`/`count`.
 */
export function reconcileReportedDeckSlideState(input: {
  reportedActive: number;
  reportedCount: number;
  htmlCount: number;
  pending: DeckSlideSyncPending | null;
}): DeckSlideSyncDecision {
  const htmlCount = positiveInt(input.htmlCount);
  const reportedCount = positiveInt(input.reportedCount);
  const pending = input.pending;
  if (pending && reportedCount !== pending.count) {
    return {
      accept: false,
      active: Math.max(0, Math.min(pending.active, Math.max(0, pending.count - 1))),
      count: pending.count,
      clearPending: false,
    };
  }
  // New HTML can report the right count while still painted on page 0
  // (bridge restore is deferred). Accepting that active yanks the pager
  // and the next `< >` / filmstrip click starts from the wrong page.
  if (pending && reportedCount === pending.count) {
    const intended = Math.max(0, Math.min(pending.active, Math.max(0, pending.count - 1)));
    const painted = Number.isFinite(input.reportedActive)
      ? Math.max(0, Math.floor(input.reportedActive))
      : 0;
    if (painted !== intended) {
      return {
        accept: false,
        active: intended,
        count: pending.count,
        clearPending: false,
      };
    }
  }
  const count = htmlCount > 0 ? htmlCount : reportedCount;
  const reportedActive = Number.isFinite(input.reportedActive)
    ? Math.max(0, Math.floor(input.reportedActive))
    : 0;
  const active = count > 0
    ? Math.min(reportedActive, count - 1)
    : 0;
  return {
    accept: count > 0,
    active,
    count,
    clearPending: Boolean(pending && reportedCount === pending.count),
  };
}
