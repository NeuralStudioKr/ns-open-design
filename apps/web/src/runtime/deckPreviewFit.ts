type DeckPreviewFitTarget = Pick<
  HTMLIFrameElement,
  'contentWindow' | 'getBoundingClientRect'
> | null | undefined;

/** Post the iframe's visual box so the deck bridge can refit when innerWidth is inflated. */
export function postDeckHostViewportToIframe(
  target: DeckPreviewFitTarget,
  hostScale = 1,
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
  win.postMessage({ type: 'od:deck-host-viewport', width, height, scale }, '*');
}

/** Ask the deck bridge / framework fit() to recompute after host layout changes. */
export function nudgeDeckPreviewFit(target: DeckPreviewFitTarget, hostScale = 1): void {
  postDeckHostViewportToIframe(target, hostScale);
  target?.contentWindow?.postMessage({ type: 'od:deck-nudge-fit' }, '*');
}

/** Deck fit() often runs while the iframe is still 0×0; re-nudge through layout settles. */
export function scheduleDeckPreviewFitNudges(
  target: DeckPreviewFitTarget,
  hostScale = 1,
  delaysMs: number[] = [0, 50, 150, 400, 900, 1600, 2500],
): () => void {
  const timers = delaysMs.map((delay) =>
    globalThis.setTimeout(() => nudgeDeckPreviewFit(target, hostScale), delay),
  );
  return () => {
    for (const id of timers) globalThis.clearTimeout(id);
  };
}
