/**
 * After a successful manual-edit POST /files, the FE refreshes the file list
 * and re-fetches disk HTML. Under Teamver S3 lazy materialization that GET
 * can briefly return null or the pre-edit snapshot. If we keep the old
 * `lastStablePreviewSourceRef` and accept that stale GET, the just-saved
 * edit appears to "not save" / reverts in the preview.
 *
 * Pin the saved buffer for a short grace window and prefer it over racy
 * refetch results (and over history-confirm GETs that lag the write).
 *
 * Soft grace (`MANUAL_EDIT_SAVE_PIN_MS`) covers typical S3 lag. If the refetch
 * is still null/stale after that, keep holding the pin until disk matches or
 * the hard cap (`MANUAL_EDIT_SAVE_PIN_MAX_MS`) elapses — otherwise a late
 * stale GET after soft expiry still clobbers the save.
 */

export const MANUAL_EDIT_SAVE_PIN_MS = 15_000;
export const MANUAL_EDIT_SAVE_PIN_MAX_MS = 60_000;

export type ManualEditSourcePin = {
  source: string;
  savedAt: number;
};

export function createManualEditSourcePin(
  source: string,
  savedAt: number = Date.now(),
): ManualEditSourcePin {
  return { source, savedAt };
}

/** True when the pin is still within the soft post-save grace window. */
export function isManualEditSourcePinFresh(
  pinned: ManualEditSourcePin | null | undefined,
  now: number = Date.now(),
): boolean {
  return Boolean(pinned && now - pinned.savedAt < MANUAL_EDIT_SAVE_PIN_MS);
}

/** True while the pin may still override a lagging disk/live candidate. */
export function isManualEditSourcePinActive(
  pinned: ManualEditSourcePin | null | undefined,
  now: number = Date.now(),
): boolean {
  return Boolean(pinned && now - pinned.savedAt < MANUAL_EDIT_SAVE_PIN_MAX_MS);
}

/**
 * When a disk refetch races our save, return the pinned source to keep.
 * Returns null when the fetch should proceed normally (no pin, hard-expired,
 * or fetch already matches the pin).
 *
 * Soft-expired pins still win while fetch is null/stale so a late S3 lag
 * after 15s cannot restore the pre-edit snapshot.
 */
export function preferManualEditPinnedSource(
  pinned: ManualEditSourcePin | null | undefined,
  fetched: string | null,
  now: number = Date.now(),
): string | null {
  if (!isManualEditSourcePinActive(pinned, now) || !pinned) return null;
  if (fetched != null && fetched === pinned.source) return null;
  if (fetched == null || fetched !== pinned.source) return pinned.source;
  return null;
}

/**
 * Live stream tokens must not clobber a fresher pinned save. Returns the
 * pin source when `liveCandidate` should be suppressed.
 */
export function preferManualEditPinnedSourceOverLive(
  pinned: ManualEditSourcePin | null | undefined,
  liveCandidate: string | null,
  now: number = Date.now(),
): string | null {
  return preferManualEditPinnedSource(pinned, liveCandidate, now);
}

/**
 * History confirm fetches disk before undo/redo/next edit. If that GET is
 * still the pre-write snapshot while `expectedSource` is our pinned save,
 * trust the local expected source instead of wiping history.
 */
export function manualEditHistoryConfirmTrustsLocal(
  expectedSource: string,
  persisted: string | null,
  pinned: ManualEditSourcePin | null | undefined,
  now: number = Date.now(),
): boolean {
  if (persisted == null || persisted === expectedSource) return true;
  return Boolean(
    isManualEditSourcePinActive(pinned, now)
    && pinned
    && pinned.source === expectedSource,
  );
}
