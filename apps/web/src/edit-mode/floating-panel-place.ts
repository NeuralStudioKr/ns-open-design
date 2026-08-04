/** Host-space rect used by Manual Edit floating chrome. */
export type FloatingPanelHostRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FloatingPanelPlaceInput = {
  target: FloatingPanelHostRect;
  canvasWidth: number;
  canvasHeight: number;
  panelWidth?: number;
  /** Estimated panel height for collision / clamping (maxHeight cap). */
  panelHeight?: number;
  pad?: number;
};

export type FloatingPanelPlaceResult = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  /** Which side won — useful for tests / future UI hints. */
  placement: 'right' | 'left' | 'below' | 'above' | 'dock';
};

const DEFAULT_PANEL_WIDTH = 320;
const DEFAULT_PREFERRED_HEIGHT = 380;
const DEFAULT_PAD = 12;

/**
 * Place the Manual Edit inspector so it prefers not to cover the selected
 * element. Order: right → left → below → above → canvas top-right dock.
 */
export function placeManualEditFloatingPanel(
  input: FloatingPanelPlaceInput,
): FloatingPanelPlaceResult {
  const panelWidth = input.panelWidth ?? DEFAULT_PANEL_WIDTH;
  const pad = input.pad ?? DEFAULT_PAD;
  const canvasWidth = Math.max(panelWidth + pad * 2, input.canvasWidth);
  const canvasHeight = Math.max(1, input.canvasHeight);
  const preferredHeight = input.panelHeight ?? DEFAULT_PREFERRED_HEIGHT;
  const panelHeight = Math.min(
    preferredHeight,
    Math.max(260, canvasHeight - pad * 2),
  );

  const target = normalizeTarget(input.target);
  const targetLeft = target.x;
  const targetTop = target.y;
  const targetRight = target.x + target.width;
  const targetBottom = target.y + target.height;

  const clampLeft = (left: number) =>
    Math.max(pad, Math.min(left, canvasWidth - panelWidth - pad));
  const clampTop = (top: number) =>
    Math.max(pad, Math.min(top, canvasHeight - panelHeight - pad));

  const candidates: Array<{
    placement: FloatingPanelPlaceResult['placement'];
    left: number;
    top: number;
  }> = [
    {
      placement: 'right',
      left: targetRight + pad,
      top: clampTop(targetTop),
    },
    {
      placement: 'left',
      left: targetLeft - panelWidth - pad,
      top: clampTop(targetTop),
    },
    {
      placement: 'below',
      left: clampLeft(targetLeft),
      top: targetBottom + pad,
    },
    {
      placement: 'above',
      left: clampLeft(targetLeft),
      top: targetTop - panelHeight - pad,
    },
    {
      placement: 'dock',
      left: canvasWidth - panelWidth - pad,
      top: pad,
    },
  ];

  let best = candidates[candidates.length - 1]!;
  let bestOverlap = Number.POSITIVE_INFINITY;
  let bestFits = false;

  for (const candidate of candidates) {
    const left = clampLeft(candidate.left);
    const top = clampTop(candidate.top);
    const fitsHorizontally =
      candidate.left >= pad - 0.5
      && candidate.left + panelWidth <= canvasWidth - pad + 0.5;
    const fitsVertically =
      candidate.top >= pad - 0.5
      && candidate.top + panelHeight <= canvasHeight - pad + 0.5;
    const fits = fitsHorizontally && fitsVertically;
    const overlap = overlapArea(
      { x: left, y: top, width: panelWidth, height: panelHeight },
      target,
    );

    // Prefer a zero-overlap placement that fits without clamping off-canvas.
    if (overlap <= 0 && fits) {
      return {
        left,
        top,
        width: panelWidth,
        maxHeight: panelHeight,
        placement: candidate.placement,
      };
    }

    // Otherwise keep the least-overlap candidate; prefer earlier sides on ties.
    if (
      overlap < bestOverlap - 0.5
      || (Math.abs(overlap - bestOverlap) <= 0.5 && !bestFits && fits)
    ) {
      best = { placement: candidate.placement, left, top };
      bestOverlap = overlap;
      bestFits = fits;
    }
  }

  return {
    left: best.left,
    top: best.top,
    width: panelWidth,
    maxHeight: panelHeight,
    placement: best.placement,
  };
}

/**
 * Keep left/top stable across selection geometry churn (resize/move previews).
 * Width / maxHeight may still follow the canvas.
 */
export function withPinnedFloatingPanelPosition(
  placed: FloatingPanelPlaceResult,
  pinned: { left: number; top: number } | null | undefined,
): FloatingPanelPlaceResult {
  if (!pinned) return placed;
  return {
    ...placed,
    left: pinned.left,
    top: pinned.top,
  };
}

/**
 * Keep a pinned inspector on-canvas after zoom / viewport shrink.
 * Uses a short height so collapsed titlebars are not pushed off the top.
 */
export function clampFloatingPanelPosition(
  position: { left: number; top: number },
  options: {
    canvasWidth: number;
    canvasHeight: number;
    panelWidth?: number;
    /** Height used only for top clamping (collapsed chrome ≈ 40). */
    panelHeight?: number;
    pad?: number;
  },
): { left: number; top: number } {
  const panelWidth = options.panelWidth ?? DEFAULT_PANEL_WIDTH;
  const panelHeight = options.panelHeight ?? 40;
  const pad = options.pad ?? DEFAULT_PAD;
  const canvasWidth = Math.max(panelWidth + pad * 2, options.canvasWidth);
  const canvasHeight = Math.max(panelHeight + pad * 2, options.canvasHeight);
  return {
    left: Math.max(pad, Math.min(position.left, canvasWidth - panelWidth - pad)),
    top: Math.max(pad, Math.min(position.top, canvasHeight - panelHeight - pad)),
  };
}

/** Collapsed titlebar chrome height used for overlap / clamp while folded. */
export const MANUAL_EDIT_PANEL_COLLAPSED_HEIGHT_PX = 40;

/**
 * Keep the current inspector position across selection changes unless it would
 * cover the newly selected element (user request: stop the panel from jumping).
 */
export function shouldRepositionFloatingPanelForSelection(input: {
  pinned: { left: number; top: number } | null | undefined;
  target: FloatingPanelHostRect;
  canvasWidth: number;
  canvasHeight: number;
  panelWidth?: number;
  /** Use collapsed chrome height when the inspector is folded. */
  panelHeight?: number;
}): boolean {
  if (!input.pinned) return true;
  const panelWidth = input.panelWidth ?? DEFAULT_PANEL_WIDTH;
  const panelHeight = input.panelHeight ?? DEFAULT_PREFERRED_HEIGHT;
  const clamped = clampFloatingPanelPosition(input.pinned, {
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    panelWidth,
    panelHeight,
  });
  return floatingPanelOverlapsTarget(
    {
      left: clamped.left,
      top: clamped.top,
      width: panelWidth,
      height: panelHeight,
    },
    input.target,
  );
}

export function floatingPanelOverlapsTarget(
  panel: { left: number; top: number; width: number; height: number },
  target: FloatingPanelHostRect,
): boolean {
  return overlapArea(
    {
      x: panel.left,
      y: panel.top,
      width: Math.max(0, panel.width),
      height: Math.max(0, panel.height),
    },
    normalizeTarget(target),
  ) > 0.5;
}

function normalizeTarget(rect: FloatingPanelHostRect): FloatingPanelHostRect {
  return {
    x: Number.isFinite(rect.x) ? rect.x : 0,
    y: Number.isFinite(rect.y) ? rect.y : 0,
    width: Math.max(0, Number.isFinite(rect.width) ? rect.width : 0),
    height: Math.max(0, Number.isFinite(rect.height) ? rect.height : 0),
  };
}

function overlapArea(a: FloatingPanelHostRect, b: FloatingPanelHostRect): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}
