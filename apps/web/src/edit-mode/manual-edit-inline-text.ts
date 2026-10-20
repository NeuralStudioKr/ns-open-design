/**
 * Inline contenteditable vs inspector Cancel / leaving edit mode.
 *
 * Clicking 취소 (or the edit-mode toggle) focuses host chrome, so the
 * iframe fires blur first and used to post `od-edit-text-commit`. That
 * persist of in-progress (often emptied) text then let heal/empty-chip
 * hide or drop the node. Host must ignore that in-flight commit and tell
 * the iframe to restore the pre-edit snapshot.
 *
 * Per-element abort is not enough for session Cancel: blur persist can
 * already have written earlier elements. FileViewer restores the edit-mode
 * entry snapshot (`planManualEditSessionCancel`) and bumps persist epoch
 * so in-flight writes lose to Cancel.
 */

export function beginInlineTextEditGeneration(current: number): number {
  return current + 1;
}

export function shouldAbortInlineTextEditOnHostAction(input: {
  inlineTextEditing: boolean;
  commitInFlightGeneration: number | null;
  pendingCommitGeneration: number | null;
  currentGeneration: number;
}): boolean {
  if (input.inlineTextEditing) return true;
  if (input.currentGeneration <= 0) return false;
  return (
    input.commitInFlightGeneration === input.currentGeneration
    || input.pendingCommitGeneration === input.currentGeneration
  );
}

export function shouldPersistInlineTextCommit(input: {
  editGeneration: number;
  cancelledGeneration: number;
}): boolean {
  return input.editGeneration > 0 && input.editGeneration !== input.cancelledGeneration;
}
