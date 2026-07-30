/**
 * Invariants for an active manual-edit session. While edit mode is on, the
 * iframe paints from `manualEditFrozenSource` and patches must apply to that
 * buffer — not a racy disk refetch that updated `sourceRef` in the background.
 */

export function manualEditPatchBaseSource(input: {
  manualEditMode: boolean;
  frozenSource: string | null;
  liveSource: string | null;
}): string | null {
  if (input.manualEditMode && input.frozenSource != null) return input.frozenSource;
  return input.liveSource;
}

/** Disk history-confirm races our own save; trust the frozen session while editing. */
export function shouldSkipManualEditHistoryConfirm(manualEditMode: boolean): boolean {
  return manualEditMode;
}

/** Hold disk refetches from clobbering the frozen canvas while edit mode is on. */
export function shouldHoldDiskPreviewDuringManualEdit(
  manualEditMode: boolean,
  frozenSource: string | null,
): boolean {
  return manualEditMode && frozenSource != null;
}

/** Host slide keyboard nav must yield while inline text editing is active. */
export function shouldSuppressHostDeckKeyboardNav(input: {
  manualEditMode: boolean;
  inlineTextEditing: boolean;
}): boolean {
  return input.manualEditMode || input.inlineTextEditing;
}
