import { manualEditHistoryConfirmTipIsWarmerThanSession } from './manual-edit-save-pin';

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

/**
 * Disk history-confirm races our own save; trust the frozen session while editing.
 *
 * When warm tip HTML already differs from the save base / authored buffer,
 * do NOT skip — tip advance must run confirm tip≠expected gates (기획 50).
 */
export function shouldSkipManualEditHistoryConfirm(
  manualEditMode: boolean,
  options?: {
    expectedSource?: string | null;
    tipContent?: string | null;
    authoredSource?: string | null;
    tipRevisionSequence?: number | null;
    activeRevisionSequence?: number | null;
  },
): boolean {
  if (!manualEditMode) return false;
  const tip = options?.tipContent;
  const expected = options?.expectedSource;
  const authored = options?.authoredSource;
  const tipGateBase = {
    tipRevisionSequence: options?.tipRevisionSequence,
    activeRevisionSequence: options?.activeRevisionSequence,
  };
  if (tip != null && expected != null && tip !== expected) {
    if (
      !manualEditHistoryConfirmTipIsWarmerThanSession({
        tipContent: tip,
        expectedSource: expected,
        authoredSource: authored,
        ...tipGateBase,
      })
    ) {
      return true;
    }
    return false;
  }
  if (tip != null && authored != null && tip !== authored) {
    if (
      !manualEditHistoryConfirmTipIsWarmerThanSession({
        tipContent: tip,
        expectedSource: expected ?? authored,
        authoredSource: authored,
        ...tipGateBase,
      })
    ) {
      return true;
    }
    return false;
  }
  return true;
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

/**
 * Session Cancel snapshot. Freeze (`manualEditFrozenSource`) remounts on
 * set-text, so it cannot restore the deck. Capture once at edit-mode entry
 * (or last Confirm/Save) and never overwrite with later dirty live HTML.
 */
export function captureManualEditSessionEntrySource(
  existing: string | null,
  liveSource: string | null,
): string | null {
  return existing ?? liveSource;
}

/** Confirm/Save commits the current buffer so a later Cancel restores here. */
export function commitManualEditSessionEntrySource(liveSource: string | null): string | null {
  return liveSource;
}

export function beginManualEditPersistEpoch(current: number): number {
  return current + 1;
}

/**
 * Blur persist can already be in-flight when Cancel mousedown runs.
 * Writes that started before the cancel epoch must not hit disk.
 */
export function shouldPersistManualEditSessionWrite(input: {
  startedEpoch: number;
  currentEpoch: number;
}): boolean {
  return input.startedEpoch === input.currentEpoch;
}

export type ManualEditSessionCancelPlan = {
  restoreSource: string | null;
  writeSnapshotToDisk: boolean;
  remountPreview: boolean;
};

/**
 * Cancel discards every in-session direct edit.
 * - dirty live (blur already persisted A then B) → write the entry snapshot
 * - live still matches (persist skipped) → remount iframe only, no dirty write
 * - emptied persist → snapshot still has the node, write it back
 */
export function planManualEditSessionCancel(input: {
  sessionSource: string | null;
  liveSource: string | null;
}): ManualEditSessionCancelPlan {
  if (input.sessionSource == null) {
    return { restoreSource: null, writeSnapshotToDisk: false, remountPreview: false };
  }
  return {
    restoreSource: input.sessionSource,
    writeSnapshotToDisk: input.liveSource !== input.sessionSource,
    remountPreview: true,
  };
}
