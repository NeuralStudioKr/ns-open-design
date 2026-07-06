/** Ask the deck bridge / framework fit() to recompute after host layout changes. */
export function nudgeDeckPreviewFit(
  target: Pick<HTMLIFrameElement, 'contentWindow'> | null | undefined,
): void {
  target?.contentWindow?.postMessage({ type: 'od:deck-nudge-fit' }, '*');
}

/** Deck fit() often runs while the iframe is still 0×0; re-nudge through layout settles. */
export function scheduleDeckPreviewFitNudges(
  target: Pick<HTMLIFrameElement, 'contentWindow'> | null | undefined,
  delaysMs: number[] = [0, 50, 150, 400, 900],
): () => void {
  const timers = delaysMs.map((delay) =>
    globalThis.setTimeout(() => nudgeDeckPreviewFit(target), delay),
  );
  return () => {
    for (const id of timers) globalThis.clearTimeout(id);
  };
}
