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
