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
 *
 * Do NOT clear the pin merely because one fetch matched: a later stale GET
 * in the same session would then fail history-confirm and surface
 * "file changed outside manual edit mode" as a false positive.
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
 * True when an authoritative tip already matches `fetched` and differs from
 * the pin — the agent tip landed; callers should clear the pin and paint tip.
 */
export function shouldReleaseManualEditSavePinForTip(
  pinned: ManualEditSourcePin | null | undefined,
  fetched: string | null,
  tipContent: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!isManualEditSourcePinActive(pinned, now) || !pinned) return false;
  return (
    fetched != null
    && tipContent != null
    && fetched === tipContent
    && fetched !== pinned.source
  );
}

/**
 * When a disk refetch races our save, return the pinned source to keep.
 * Returns null when the fetch should proceed normally (no pin, hard-expired,
 * fetch already matches the pin, or tip content already matches fetch).
 *
 * Soft-expired pins still win while fetch is null/stale so a late S3 lag
 * after 15s cannot restore the pre-edit snapshot.
 *
 * `tipContent` is the in-memory tip revision HTML (when warm). When it equals
 * `fetched` and differs from the pin, yield so agent tips are not held back.
 */
export function preferManualEditPinnedSource(
  pinned: ManualEditSourcePin | null | undefined,
  fetched: string | null,
  now: number = Date.now(),
  tipContent?: string | null,
): string | null {
  if (!isManualEditSourcePinActive(pinned, now) || !pinned) return null;
  if (fetched != null && fetched === pinned.source) return null;
  if (shouldReleaseManualEditSavePinForTip(pinned, fetched, tipContent, now)) {
    return null;
  }
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
  tipContent?: string | null,
): string | null {
  return preferManualEditPinnedSource(pinned, liveCandidate, now, tipContent);
}

/**
 * History confirm fetches disk before undo/redo/next edit. If that GET is
 * still the pre-write snapshot while `expectedSource` is our local save,
 * trust the local buffer instead of wiping history / blocking the edit.
 *
 * `authoredSource` is the host's last-stable / pinned authored bytes. When it
 * still equals `expectedSource`, a disagreeing GET is treated as lag — not an
 * external rewrite (true external rewrites update authored via the live/disk
 * apply path before the next edit).
 */
export function manualEditHistoryConfirmTrustsLocal(
  expectedSource: string,
  persisted: string | null,
  pinned: ManualEditSourcePin | null | undefined,
  now: number = Date.now(),
  authoredSource?: string | null,
): boolean {
  if (persisted == null || persisted === expectedSource) return true;
  if (authoredSource != null && authoredSource === expectedSource) return true;
  return Boolean(
    isManualEditSourcePinActive(pinned, now)
    && pinned
    && pinned.source === expectedSource,
  );
}

/**
 * True when history-confirm can skip the disk GET — an active pin or authored
 * buffer already matches the bytes we are about to save.
 */
export function manualEditHistoryConfirmCanSkipDiskFetch(
  expectedSource: string,
  pinned: ManualEditSourcePin | null | undefined,
  now: number = Date.now(),
  authoredSource?: string | null,
): boolean {
  if (authoredSource != null && authoredSource === expectedSource) return true;
  return Boolean(
    isManualEditSourcePinActive(pinned, now)
    && pinned
    && pinned.source === expectedSource,
  );
}
