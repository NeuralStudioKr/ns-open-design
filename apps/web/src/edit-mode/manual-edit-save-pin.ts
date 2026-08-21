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
  authoredSource?: string | null,
): boolean {
  if (!isManualEditSourcePinActive(pinned, now) || !pinned) return false;
  if (
    fetched == null
    || tipContent == null
    || fetched !== tipContent
    || fetched === pinned.source
  ) {
    return false;
  }
  // fetched===tip≠pin is also the move-save false positive (stale GET and
  // stale active-revision cache agree). Release only when the session already
  // paints that tip, or when no painted-source hint is available (legacy).
  if (authoredSource != null && authoredSource === pinned.source) return false;
  return true;
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
  authoredSource?: string | null,
): string | null {
  if (!isManualEditSourcePinActive(pinned, now) || !pinned) return null;
  if (fetched != null && fetched === pinned.source) return null;
  if (shouldReleaseManualEditSavePinForTip(pinned, fetched, tipContent, now, authoredSource)) {
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
  tipGate?: Pick<
    ManualEditHistoryConfirmTipGateInput,
    'tipRevisionSequence' | 'activeRevisionSequence' | 'authoredSource'
  >,
): string | null {
  if (!isManualEditSourcePinActive(pinned, now) || !pinned) return null;
  if (tipContent == null || tipContent === pinned.source) return null;
  // Same-revision stale cache is not a warmer agent tip — keep the pin
  // (move/style save must not revert to pre-edit HTML).
  if (
    tipGate
    && !manualEditHistoryConfirmTipIsWarmerThanSession({
      tipContent,
      expectedSource: pinned.source,
      authoredSource: tipGate.authoredSource ?? pinned.source,
      tipRevisionSequence: tipGate.tipRevisionSequence,
      activeRevisionSequence: tipGate.activeRevisionSequence,
    })
  ) {
    return null;
  }
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
  tipRevisionSequence?: number | null;
  activeRevisionSequence?: number | null;
  authoredSource?: string | null;
}): ManualEditPinTipResolveResult {
  const now = input.now ?? Date.now();
  const tipGate = (
    input.tipRevisionSequence != null
    || input.activeRevisionSequence != null
    || input.authoredSource != null
  )
    ? {
      tipRevisionSequence: input.tipRevisionSequence,
      activeRevisionSequence: input.activeRevisionSequence,
      authoredSource: input.authoredSource,
    }
    : undefined;
  const tipOverPin = preferManualEditTipOverPinnedSave(
    input.pinned,
    input.tipContent,
    now,
    tipGate,
  );
  if (tipOverPin != null) {
    return { source: tipOverPin, clearPin: true };
  }
  if (shouldReleaseManualEditSavePinForTip(
    input.pinned,
    input.candidate,
    input.tipContent,
    now,
    input.authoredSource,
  )) {
    return { source: input.candidate, clearPin: true };
  }
  const preferred = preferManualEditPinnedSource(
    input.pinned,
    input.candidate,
    now,
    input.tipContent,
    input.authoredSource,
  );
  if (preferred != null) {
    return { source: preferred, clearPin: false };
  }
  if (
    input.preferTipWhenCandidateLags
    && input.tipContent != null
    && (input.candidate == null || input.candidate !== input.tipContent)
  ) {
    if (
      tipGate
      && !manualEditHistoryConfirmTipIsWarmerThanSession({
        tipContent: input.tipContent,
        expectedSource: input.candidate ?? input.pinned?.source ?? input.tipContent,
        authoredSource: input.authoredSource,
        tipRevisionSequence: input.tipRevisionSequence,
        activeRevisionSequence: input.activeRevisionSequence,
      })
    ) {
      return { source: input.candidate, clearPin: false };
    }
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

export type ManualEditHistoryConfirmTipGateInput = {
  tipContent?: string | null;
  expectedSource: string;
  authoredSource?: string | null;
  tipRevisionSequence?: number | null;
  activeRevisionSequence?: number | null;
};

/**
 * True when warm tip HTML is ahead of the save base / session cursor.
 * When false, tip≠expected is stale cache (manual-edit move/style save).
 *
 * Without revision sequences, tip≠expected is conservatively warmer (agent tip
 * lag — 기획 50).
 */
export function manualEditHistoryConfirmTipIsWarmerThanSession(
  input: ManualEditHistoryConfirmTipGateInput,
): boolean {
  const {
    tipContent,
    expectedSource,
    authoredSource,
    tipRevisionSequence,
    activeRevisionSequence,
  } = input;
  if (tipContent == null || tipContent === expectedSource) return false;
  // Same/older revision: cache or lastStable paint drift is not agent tip
  // advance — even when authored already drifted to those stale bytes.
  if (tipRevisionSequence != null && activeRevisionSequence != null) {
    return tipRevisionSequence > activeRevisionSequence;
  }
  if (authoredSource != null && authoredSource === tipContent) return true;
  return true;
}

/**
 * Warm tip HTML + sequences for history-confirm / pin-yield gates.
 * When the session cursor is unset, treat the resolved revision as the cursor
 * so same-revision cache drift is not a false "warmer tip".
 */
export function resolveManualEditHistoryConfirmTipContext(input: {
  stack: ManualEditSavePinTipStack;
  activeSequence: number | null | undefined;
  readContent: (revisionId: string) => string | null;
  coldFallback?: string | null;
}): {
  tipContent: string | null;
  tipRevisionSequence: number | null;
  activeRevisionSequence: number | null;
} {
  const tipRevision = resolveManualEditSavePinTipRevision(input.stack, input.activeSequence);
  const resolvedSeq = tipRevision?.sequence ?? null;
  return {
    tipContent: tipContentForManualEditSavePin(
      input.stack,
      input.activeSequence,
      input.readContent,
      input.coldFallback,
    ),
    tipRevisionSequence: resolvedSeq,
    activeRevisionSequence: input.activeSequence ?? resolvedSeq,
  };
}

/**
 * filesRefresh must not drop a just-saved pin because the active-revision
 * cache still holds pre-edit bytes. Drop only when the canvas already paints
 * the diverging tip (agent tip adopted).
 */
export function shouldDropManualEditSavePinForFilesRefresh(input: {
  pinnedSource: string;
  tipCached: string | null | undefined;
  paintedSource: string | null | undefined;
  tipRevisionSequence?: number | null;
  activeRevisionSequence?: number | null;
}): boolean {
  if (input.tipCached == null || input.tipCached === input.pinnedSource) return false;
  if (input.paintedSource !== input.tipCached) return false;
  // Canvas matching a diverging cache is only a tip adopt when that cache
  // is a newer revision — not the same-revision stale paint of a move save.
  return manualEditHistoryConfirmTipIsWarmerThanSession({
    tipContent: input.tipCached,
    expectedSource: input.pinnedSource,
    authoredSource: input.paintedSource,
    tipRevisionSequence: input.tipRevisionSequence,
    activeRevisionSequence: input.activeRevisionSequence,
  });
}

/**
 * Session bytes for history-confirm. Prefer the last save pin (even after
 * hard cap) then the live session buffer — lastStable can be a stale
 * accepted preview frame and must not win over sourceRef.
 */
export function resolveManualEditHistoryConfirmAuthoredSource(input: {
  pinnedSource?: string | null;
  liveSource?: string | null;
  lastStableSource?: string | null;
}): string | null {
  return input.pinnedSource ?? input.liveSource ?? input.lastStableSource ?? null;
}

/** Confirm refuse must not adopt a missing disk frame over the session buffer. */
export function shouldAdoptManualEditHistoryConfirmPersisted(
  persisted: string | null,
): persisted is string {
  return persisted != null;
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
  tipRevisionSequence?: number | null,
  activeRevisionSequence?: number | null,
): boolean {
  const tipGate: ManualEditHistoryConfirmTipGateInput = {
    tipContent,
    expectedSource,
    authoredSource,
    tipRevisionSequence,
    activeRevisionSequence,
  };
  // Tip≠expected must run BEFORE persisted===expected. S3 can still show the
  // old save while tip cache is warmer — trusting local would overwrite tip.
  if (tipContent != null && tipContent !== expectedSource) {
    const tipWarmer = manualEditHistoryConfirmTipIsWarmerThanSession(tipGate);
    if (!tipWarmer) {
      if (authoredSource != null && authoredSource === expectedSource) return true;
      if (
        isManualEditSourcePinActive(pinned, now)
        && pinned
        && pinned.source === expectedSource
      ) {
        return true;
      }
      if (persisted == null || persisted === expectedSource) return true;
    }
    // Tip is warmer (or legacy strict) — standard yield gates.
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
  tipRevisionSequence?: number | null,
  activeRevisionSequence?: number | null,
): boolean {
  if (
    tipContent != null
    && tipContent !== expectedSource
  ) {
    if (!manualEditHistoryConfirmTipIsWarmerThanSession({
      tipContent,
      expectedSource,
      authoredSource,
      tipRevisionSequence,
      activeRevisionSequence,
    })) {
      if (authoredSource != null && authoredSource === expectedSource) return true;
      if (
        isManualEditSourcePinActive(pinned, now)
        && pinned
        && pinned.source === expectedSource
      ) {
        return true;
      }
    }
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
