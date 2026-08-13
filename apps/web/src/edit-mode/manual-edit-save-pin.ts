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
 * When warm tip already differs from the pin, paint tip and clear the pin —
 * even if live/disk candidate is still the pre-tip buffer (liveHtml lag).
 */
export function preferManualEditTipOverPinnedSave(
  pinned: ManualEditSourcePin | null | undefined,
  tipContent: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!isManualEditSourcePinActive(pinned, now) || !pinned) return null;
  if (tipContent == null || tipContent === pinned.source) return null;
  return tipContent;
}

export type ManualEditPinTipResolveResult = {
  source: string | null;
  clearPin: boolean;
};

/**
 * Resolve a live/disk candidate against save pin + warm tip.
 *
 * - Tip≠pin → paint tip, clear pin (candidate may still be stale).
 * - Classic tip yield when candidate===tip≠pin.
 * - Otherwise prefer pin over lagging candidate.
 * - `preferTipWhenCandidateLags` (disk): with no pin, paint tip over lagging GET.
 *   Leave false for liveHtml so streaming tokens are not blocked by tip cache.
 */
export function resolveManualEditSourceAgainstPinAndTip(input: {
  pinned: ManualEditSourcePin | null | undefined;
  candidate: string | null;
  tipContent: string | null | undefined;
  now?: number;
  preferTipWhenCandidateLags?: boolean;
}): ManualEditPinTipResolveResult {
  const now = input.now ?? Date.now();
  const tipOverPin = preferManualEditTipOverPinnedSave(
    input.pinned,
    input.tipContent,
    now,
  );
  if (tipOverPin != null) {
    return { source: tipOverPin, clearPin: true };
  }
  if (shouldReleaseManualEditSavePinForTip(
    input.pinned,
    input.candidate,
    input.tipContent,
    now,
  )) {
    return { source: input.candidate, clearPin: true };
  }
  const preferred = preferManualEditPinnedSource(
    input.pinned,
    input.candidate,
    now,
    input.tipContent,
  );
  if (preferred != null) {
    return { source: preferred, clearPin: false };
  }
  if (
    input.preferTipWhenCandidateLags
    && input.tipContent != null
    && (input.candidate == null || input.candidate !== input.tipContent)
  ) {
    return { source: input.tipContent, clearPin: false };
  }
  return { source: input.candidate, clearPin: false };
}

/**
 * Whether a pin/tip resolve result should early-paint, or fall through so the
 * caller can run incomplete-HTML soft retry / acceptPreviewHtmlCandidate.
 *
 * Tip prefer must not paint unstable tip HTML over a lagging-but-retryable GET.
 * `tipOrPinStable` is the caller's stability gate (artifact preview stable).
 */
export function shouldEarlyPaintResolvedPinTipSource(input: {
  resolved: ManualEditPinTipResolveResult;
  candidate: string | null;
  tipOrPinStable: boolean;
}): boolean {
  const { resolved, candidate, tipOrPinStable } = input;
  if (resolved.source == null) return false;
  if (!(resolved.clearPin || resolved.source !== candidate)) return false;
  // Unstable tip/pin prefer — let disk soft-retry try again.
  if (!tipOrPinStable) return false;
  return true;
}

/**
 * Early-paint tip/pin only when `acceptPreviewHtmlCandidate` kept those exact
 * repaired bytes as lastStable — not when it fell back to an unrelated frame.
 */
export function acceptedKeepsEarlyPaintTipOrPin(
  repairedTipOrPin: string,
  accepted: string | null,
): boolean {
  return accepted === repairedTipOrPin;
}

/**
 * After history-confirm refuse adopts disk tip B, drop warm tip cache A so the
 * next authoritative tip resolve / preferTip path cannot early-paint A over B.
 */
export function shouldClearTipContentCacheAfterConfirmRefuse(
  cachedTip: string | null | undefined,
  adoptedSource: string,
): boolean {
  return cachedTip != null && cachedTip !== adoptedSource;
}

/**
 * Disk tip prefer is suppressed while confirm-refuse refresh is still landing —
 * warm stack tip must not clobber the just-adopted disk frame.
 */
export function shouldPreferTipWhenCandidateLags(input: {
  diskPath: boolean;
  suppressUntilRefresh: boolean;
}): boolean {
  return input.diskPath && !input.suppressUntilRefresh;
}

export type ManualEditTipPreferSuppressEvent =
  | 'confirm-refuse'
  | 'refresh-committed'
  | 'refresh-gave-up'
  /** Generation bump cancelled this refresh; a newer refresh (or artifact switch) owns release. */
  | 'refresh-generation-mismatch'
  | 'artifact-switch';

/**
 * Tip-prefer suppress latch. Generation-mismatch keeps the current latch (newer
 * refresh must commit/give-up). Artifact switch / unmount must clear — cancelled
 * refresh will not reach commit after `revisionRefreshGenerationRef` bumps.
 */
export function nextTipPreferSuppressState(
  event: ManualEditTipPreferSuppressEvent,
  current: boolean = false,
): boolean {
  switch (event) {
    case 'confirm-refuse':
      return true;
    case 'refresh-generation-mismatch':
      return current;
    case 'refresh-committed':
    case 'refresh-gave-up':
    case 'artifact-switch':
      return false;
  }
}

/**
 * Confirm-refuse then artifact-switch must restore disk tip prefer — suppress
 * cannot stick after the cancelled refresh can no longer commit (기획 50).
 */
export function shouldPreferTipAfterConfirmRefuseArtifactSwitch(): boolean {
  const suppressed = nextTipPreferSuppressState('confirm-refuse');
  const afterSwitch = nextTipPreferSuppressState('artifact-switch', suppressed);
  return shouldPreferTipWhenCandidateLags({
    diskPath: true,
    suppressUntilRefresh: afterSwitch,
  });
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
  tipContent?: string | null,
): boolean {
  // Tip≠expected must run BEFORE persisted===expected. S3 can still show the
  // old save while tip cache is warmer — trusting local would overwrite tip.
  if (tipContent != null && tipContent !== expectedSource) {
    // Disk already at tip, or session authored already adopted tip.
    if (persisted === tipContent) return false;
    if (authoredSource != null && authoredSource === tipContent) return false;
    // Disk still null/expected (lag) while tip is warm — force refresh path.
    if (persisted == null || persisted === expectedSource) return false;
  }
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
 *
 * When warm tip HTML already differs from `expectedSource`, do not skip — force
 * the GET / trustsLocal tip gate (parity with pin tip-yield after agent advance).
 */
export function manualEditHistoryConfirmCanSkipDiskFetch(
  expectedSource: string,
  pinned: ManualEditSourcePin | null | undefined,
  now: number = Date.now(),
  authoredSource?: string | null,
  tipContent?: string | null,
): boolean {
  if (
    tipContent != null
    && tipContent !== expectedSource
  ) {
    return false;
  }
  if (authoredSource != null && authoredSource === expectedSource) return true;
  return Boolean(
    isManualEditSourcePinActive(pinned, now)
    && pinned
    && pinned.source === expectedSource,
  );
}

export type ManualEditSavePinTipStack = {
  revisions: Array<{ id: string; sequence: number }>;
  headRevisionId: string | null;
};

/**
 * Prefer active sequence → head revision → last stack entry.
 *
 * When `activeSeq` is set but missing from the in-memory stack (agent tip
 * advanced before list refresh), return null — do NOT fall back to HEAD.
 * HEAD fallback made warm stale cache win over `coldFallback` and blocked
 * pin tip-yield (fetched tip B, tipContent A → prefer pin A).
 */
export function resolveManualEditSavePinTipRevision(
  stack: ManualEditSavePinTipStack,
  activeSeq: number | null | undefined,
): { id: string; sequence: number } | null {
  if (activeSeq != null) {
    return stack.revisions.find((revision) => revision.sequence === activeSeq) ?? null;
  }
  return (
    stack.revisions.find((revision) => revision.id === stack.headRevisionId)
    ?? stack.revisions.at(-1)
    ?? null
  );
}

/**
 * Warm tip revision HTML for pin tip≠ yield (active → head → tip).
 * `readContent` is the host revision content cache lookup.
 * `coldFallback` covers snapshot/resolve when the in-memory tip cache is cold
 * or when activeSeq is ahead of the stack (see resolve tip revision).
 */
export function tipContentForManualEditSavePin(
  stack: ManualEditSavePinTipStack,
  activeSeq: number | null | undefined,
  readContent: (revisionId: string) => string | null,
  coldFallback?: string | null,
): string | null {
  const tipRevision = resolveManualEditSavePinTipRevision(stack, activeSeq);
  if (!tipRevision) return coldFallback ?? null;
  return readContent(tipRevision.id) ?? coldFallback ?? null;
}
