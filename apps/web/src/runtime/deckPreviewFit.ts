type DeckPreviewFitTarget = Pick<
  HTMLIFrameElement,
  'contentWindow' | 'getBoundingClientRect' | 'clientWidth' | 'clientHeight'
> | null | undefined;

/** Static target or live getter — prefer getter across remounts / delayed nudges. */
export type DeckPreviewFitTargetResolver = DeckPreviewFitTarget | (() => DeckPreviewFitTarget);

export type DeckPreviewFitOptions = {
  /** Auto-fit modal scalers pass scale < 1 without user zoom — reconstruct layout width. */
  layoutFit?: boolean;
  /**
   * Letterboxed deck previews scale the iframe shell with CSS transform. Use the
   * iframe layout box (clientWidth/Height) instead of getBoundingClientRect so
   * host zoom does not reflow slide content or double-apply scale.
   */
  useLayoutBox?: boolean;
  /**
   * Called after posting `od:deck-nudge-fit` — tip remount remasure hook (487).
   * Must stay side-effect light; deck fit itself does not depend on the result.
   */
  onAfterNudge?: () => void;
};

const DEFAULT_FIT_NUDGE_DELAYS_MS = [0, 50, 150, 400, 900, 1600, 2500, 4000, 6500] as const;
/** Extra retries when the iframe still reports 0×0 (panel not laid out yet). */
const ZERO_SIZE_RETRY_DELAYS_MS = [0, 16, 50, 100, 200, 400, 800, 1600, 2500, 4000, 6500] as const;

function resolveDeckPreviewFitTarget(
  targetOrGet: DeckPreviewFitTargetResolver,
): DeckPreviewFitTarget {
  return typeof targetOrGet === 'function' ? targetOrGet() : targetOrGet;
}

function readDeckHostViewportSize(
  target: DeckPreviewFitTarget,
  options?: Pick<DeckPreviewFitOptions, 'useLayoutBox'>,
): { width: number; height: number } {
  if (!target) return { width: 0, height: 0 };
  if (options?.useLayoutBox) {
    const width = Math.max(0, target.clientWidth || 0);
    const height = Math.max(0, target.clientHeight || 0);
    if (width > 0 && height > 0) return { width, height };
  }
  try {
    const rect = target.getBoundingClientRect?.();
    return {
      width: Math.max(0, rect?.width ?? 0),
      height: Math.max(0, rect?.height ?? 0),
    };
  } catch {
    return { width: 0, height: 0 };
  }
}

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

/** Resolve which preview iframe owns a bridge postMessage source. */
export function resolveDeckPreviewIframeFromSource(
  source: MessageEventSource | null | undefined,
  candidates: Array<HTMLIFrameElement | null | undefined>,
): HTMLIFrameElement | null {
  if (!source) return null;
  for (const frame of candidates) {
    if (frame && frame.contentWindow === source) return frame;
  }
  return null;
}

/**
 * Post the iframe's visual box so the deck bridge can refit when innerWidth is inflated.
 * @returns true when a non-zero viewport was posted.
 */
export function postDeckHostViewportToIframe(
  target: DeckPreviewFitTarget,
  hostScale = 1,
  options?: DeckPreviewFitOptions,
): boolean {
  const win = target?.contentWindow;
  if (!win) return false;
  const { width, height } = readDeckHostViewportSize(target, options);
  if (width <= 0 || height <= 0) return false;
  const scale = Number.isFinite(hostScale) && hostScale > 0 ? hostScale : 1;
  win.postMessage({
    type: 'od:deck-host-viewport',
    width,
    height,
    scale,
    layoutFit: options?.layoutFit === true,
  }, '*');
  return true;
}

/**
 * Keep posting across the delay window while the iframe gains a measurable box.
 * Generation-complete → liveHtml clear and Teamver prefix remounts often mount
 * at 0×0, then swap the contentWindow. Stopping after the first successful post
 * left the replacement iframe without a host viewport (black letterbox until
 * toolbar refresh) — re-resolve the target on every tick like fit nudges.
 */
export function schedulePostDeckHostViewportUntilSized(
  targetOrGet: DeckPreviewFitTargetResolver,
  hostScale = 1,
  delaysMsOrOptions: number[] | DeckPreviewFitOptions = [...ZERO_SIZE_RETRY_DELAYS_MS],
  maybeOptions?: DeckPreviewFitOptions,
): () => void {
  const delaysMs = Array.isArray(delaysMsOrOptions)
    ? delaysMsOrOptions
    : [...ZERO_SIZE_RETRY_DELAYS_MS];
  const options = Array.isArray(delaysMsOrOptions) ? maybeOptions : delaysMsOrOptions;
  let cancelled = false;
  const timers: Array<ReturnType<typeof globalThis.setTimeout>> = [];
  for (const delay of delaysMs) {
    timers.push(
      globalThis.setTimeout(() => {
        if (cancelled) return;
        postDeckHostViewportToIframe(
          resolveDeckPreviewFitTarget(targetOrGet),
          hostScale,
          options,
        );
      }, delay),
    );
  }
  return () => {
    cancelled = true;
    for (const id of timers) globalThis.clearTimeout(id);
  };
}

/** Ask the deck bridge / framework fit() to recompute after host layout changes. */
export function nudgeDeckPreviewFit(
  targetOrGet: DeckPreviewFitTargetResolver,
  hostScale = 1,
  options?: DeckPreviewFitOptions,
): void {
  const target = resolveDeckPreviewFitTarget(targetOrGet);
  postDeckHostViewportToIframe(target, hostScale, options);
  target?.contentWindow?.postMessage({ type: 'od:deck-nudge-fit' }, '*');
  options?.onAfterNudge?.();
}

/** Deck fit() often runs while the iframe is still 0×0; re-nudge through layout settles. */
export function scheduleDeckPreviewFitNudges(
  targetOrGet: DeckPreviewFitTargetResolver,
  hostScale = 1,
  delaysMsOrOptions: number[] | DeckPreviewFitOptions = [...DEFAULT_FIT_NUDGE_DELAYS_MS],
  maybeOptions?: DeckPreviewFitOptions,
): () => void {
  const delaysMs = Array.isArray(delaysMsOrOptions)
    ? delaysMsOrOptions
    : [...DEFAULT_FIT_NUDGE_DELAYS_MS];
  const options = Array.isArray(delaysMsOrOptions) ? maybeOptions : delaysMsOrOptions;
  const timers = delaysMs.map((delay) =>
    globalThis.setTimeout(
      () => nudgeDeckPreviewFit(targetOrGet, hostScale, options),
      delay,
    ),
  );
  return () => {
    for (const id of timers) globalThis.clearTimeout(id);
  };
}
