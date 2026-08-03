/**
 * Invariants for an active manual-edit session. While edit mode is on, the
 * iframe paints from `manualEditFrozenSource` (display freeze) while
 * `sourceRef` / liveSource advances on every successful save. Patches must
 * stack on the latest saved buffer — not the entry freeze — otherwise a
 * second style/text edit re-applies against pre-style HTML and drops the
 * first change. Disk refetches are held separately via
 * `shouldHoldDiskPreviewDuringManualEdit`.
 */

export function manualEditPatchBaseSource(input: {
  manualEditMode: boolean;
  frozenSource: string | null;
  liveSource: string | null;
}): string | null {
  if (input.manualEditMode) {
    // Prefer the session save buffer so successive patches compose.
    if (input.liveSource != null) return input.liveSource;
    if (input.frozenSource != null) return input.frozenSource;
  }
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
