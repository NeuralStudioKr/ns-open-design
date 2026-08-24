/**
 * Pending style drafts are previewed via `od-edit-preview-style` and only
 * written on flush (Save / exit / target boundary). Clearing the pending
 * snapshot before apply succeeds means a failed POST drops the draft — the
 * second Save then persists nothing. Keep the snapshot until success, and
 * restore it when a flush fails and nothing newer has been queued.
 *
 * Exit / boundary flushes that race an in-flight write must wait for the
 * lock instead of returning false and abandoning the draft (or exiting while
 * a failing autosave still owns the pending snapshot).
 */

import type { ManualEditStyles } from './types';

export const MANUAL_EDIT_STYLE_AUTOSAVE_MS = 800;
export const MANUAL_EDIT_SAVE_IDLE_POLL_MS = 16;
export const MANUAL_EDIT_SAVE_IDLE_TIMEOUT_MS = 8_000;

export type ManualEditPendingStyleSnapshot = {
  id: string;
  styles: Partial<ManualEditStyles>;
  label: string;
  version: number;
};

/** True when switching / clearing selection must flush another target's draft. */
export function shouldFlushManualEditStylesOnTargetBoundary(
  pendingId: string | null | undefined,
  nextTargetId: string | null,
): boolean {
  if (!pendingId) return false;
  if (nextTargetId == null) return true;
  return pendingId !== nextTargetId;
}

/**
 * Geometry gestures pause autosave so mid-drag writes do not race remasure.
 * A non-force flush that returns success while paused is a silent no-op — exit /
 * dismiss / selection-boundary callers must pass `{ force: true }` or pending
 * drafts are dropped when edit mode tears down.
 */
export function shouldSkipManualEditStyleFlushWhilePaused(
  paused: boolean,
  options?: { force?: boolean },
): boolean {
  return paused && !options?.force;
}

/** Re-selecting the same element must keep a user/auto-pinned inspector. */
export function shouldResetManualEditPanelPinOnSelect(
  previousTargetId: string | null | undefined,
  nextTargetId: string,
): boolean {
  return previousTargetId !== nextTargetId;
}

export type ManualEditPendingStyleLike = {
  id: string;
  targetIds?: string[];
  perTargetStyles?: Record<string, Partial<ManualEditStyles>>;
  styles: Partial<ManualEditStyles>;
};

export type ManualEditPendingStyleEntry = {
  id: string;
  styles: Partial<ManualEditStyles>;
};

export function manualEditPendingStyleEntries(
  pending: ManualEditPendingStyleLike,
): ManualEditPendingStyleEntry[] {
  if (pending.perTargetStyles) {
    return Object.entries(pending.perTargetStyles).map(([id, styles]) => ({ id, styles }));
  }
  const ids = pending.targetIds ?? [pending.id];
  return ids.map((id) => ({ id, styles: pending.styles }));
}

export function manualEditPendingAffectedIds(
  pending: ManualEditPendingStyleLike,
): string[] {
  if (pending.perTargetStyles) {
    return Object.keys(pending.perTargetStyles);
  }
  return [...(pending.targetIds ?? [pending.id])];
}

export function manualEditPendingHasStyleDraft(
  pending: ManualEditPendingStyleLike,
): boolean {
  if (pending.perTargetStyles) {
    return Object.keys(pending.perTargetStyles).length > 0;
  }
  return Object.keys(pending.styles).length > 0;
}

/**
 * After a failed flush that cleared `pending` before apply, put it back unless
 * the user already queued a newer draft during the in-flight write.
 */
export function restoreManualEditPendingStyleAfterFailedFlush<T extends ManualEditPendingStyleSnapshot>(
  currentPending: T | null,
  flushedPending: T,
): T {
  return currentPending ?? flushedPending;
}

/**
 * Keys to roll back when a move/promote/resize gesture flush fails (or the
 * user cancels). Promote sessions capture `position` on `stylesBefore`; other
 * gestures roll back only the keys they recorded at drag start.
 */
export function manualEditGestureRollbackKeys(
  stylesBefore: Partial<ManualEditStyles>,
  promoteKeys: ReadonlyArray<keyof ManualEditStyles>,
): Array<keyof ManualEditStyles> {
  if (Object.prototype.hasOwnProperty.call(stylesBefore, 'position')) {
    return [...promoteKeys];
  }
  return (Object.keys(stylesBefore) as Array<keyof ManualEditStyles>);
}

/**
 * Build the iframe/draft style patch that restores pre-gesture values.
 *
 * Invariant: restoring the pending snapshot after a failed flush is not enough
 * — the live preview still shows post-gesture styles until this patch is
 * previewed (and those keys are dropped or restored on pending).
 */
export function keyedManualEditStyleRollback(
  stylesBefore: Partial<ManualEditStyles>,
  keys: ReadonlyArray<keyof ManualEditStyles>,
): Partial<ManualEditStyles> {
  const reset: Partial<ManualEditStyles> = {};
  for (const key of keys) {
    reset[key] = stylesBefore[key] ?? '';
  }
  return reset;
}

/**
 * Wait until `isBusy()` is false, or until the timeout. Returns whether the
 * lock cleared in time.
 */
export async function waitForManualEditSaveIdle(
  isBusy: () => boolean,
  options?: {
    pollMs?: number;
    timeoutMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<boolean> {
  if (!isBusy()) return true;
  const pollMs = options?.pollMs ?? MANUAL_EDIT_SAVE_IDLE_POLL_MS;
  const timeoutMs = options?.timeoutMs ?? MANUAL_EDIT_SAVE_IDLE_TIMEOUT_MS;
  const now = options?.now ?? Date.now;
  const sleep = options?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + timeoutMs;
  while (isBusy()) {
    if (now() >= deadline) return false;
    await sleep(pollMs);
  }
  return true;
}
