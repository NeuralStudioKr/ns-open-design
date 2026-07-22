type DeckPreviewFitTarget = Pick<
  HTMLIFrameElement,
  'contentWindow' | 'getBoundingClientRect'
> | null | undefined;

export type DeckPreviewFitOptions = {
  /** Auto-fit modal scalers pass scale < 1 without user zoom — reconstruct layout width. */
  layoutFit?: boolean;
};

/** Post pan delta so the deck bridge can move the letterboxed stage. */
export function postDeckPreviewPanBy(
  target: DeckPreviewFitTarget,
  left: number,
  top: number,
): void {
  const win = target?.contentWindow;
  if (!win) return;
  const dx = Number.isFinite(left) ? left : 0;
  const dy = Number.isFinite(top) ? top : 0;
  if (!dx && !dy) return;
  win.postMessage({ type: 'od:preview-scroll-by', left: dx, top: dy }, '*');
}

/** Reset deck pan to the centered letterbox position. */
export function resetDeckPreviewPan(target: DeckPreviewFitTarget): void {
  target?.contentWindow?.postMessage({ type: 'od:deck-pan-reset' }, '*');
}

/** Post the iframe's visual box so the deck bridge can refit when innerWidth is inflated. */
export function postDeckHostViewportToIframe(
  target: DeckPreviewFitTarget,
  hostScale = 1,
  options?: DeckPreviewFitOptions,
): void {
  const win = target?.contentWindow;
  if (!win) return;
  let width = 0;
  let height = 0;
  try {
    const rect = target?.getBoundingClientRect?.();
    width = rect?.width ?? 0;
    height = rect?.height ?? 0;
  } catch {
    return;
  }
  if (width <= 0 || height <= 0) return;
  const scale = Number.isFinite(hostScale) && hostScale > 0 ? hostScale : 1;
  win.postMessage({
    type: 'od:deck-host-viewport',
    width,
    height,
    scale,
    layoutFit: options?.layoutFit === true,
  }, '*');
}

/** Ask the deck bridge / framework fit() to recompute after host layout changes. */
export function nudgeDeckPreviewFit(
  target: DeckPreviewFitTarget,
  hostScale = 1,
  options?: DeckPreviewFitOptions,
): void {
  postDeckHostViewportToIframe(target, hostScale, options);
  target?.contentWindow?.postMessage({ type: 'od:deck-nudge-fit' }, '*');
}

/** Deck fit() often runs while the iframe is still 0×0; re-nudge through layout settles. */
export function scheduleDeckPreviewFitNudges(
  target: DeckPreviewFitTarget,
  hostScale = 1,
  delaysMsOrOptions: number[] | DeckPreviewFitOptions = [0, 50, 150, 400, 900, 1600, 2500],
  maybeOptions?: DeckPreviewFitOptions,
): () => void {
  const delaysMs = Array.isArray(delaysMsOrOptions)
    ? delaysMsOrOptions
    : [0, 50, 150, 400, 900, 1600, 2500];
  const options = Array.isArray(delaysMsOrOptions) ? maybeOptions : delaysMsOrOptions;
  const timers = delaysMs.map((delay) =>
    globalThis.setTimeout(() => nudgeDeckPreviewFit(target, hostScale, options), delay),
  );
  return () => {
    for (const id of timers) globalThis.clearTimeout(id);
  };
}
