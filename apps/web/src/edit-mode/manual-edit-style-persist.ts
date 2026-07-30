/**
 * Pending style drafts are previewed via `od-edit-preview-style` and only
 * written on flush (Save / exit / target boundary). Clearing the pending
 * snapshot before apply succeeds means a failed POST drops the draft — the
 * second Save then persists nothing. Keep the snapshot until success, and
 * restore it when a flush fails and nothing newer has been queued.
 */

import type { ManualEditStyles } from './types';

export const MANUAL_EDIT_STYLE_AUTOSAVE_MS = 800;

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
