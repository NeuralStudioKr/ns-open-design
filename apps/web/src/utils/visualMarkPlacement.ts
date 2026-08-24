/** Teamver slide decks use a fixed 1920×1080 canvas in deck.html. */
export const TEAMVER_SLIDE_CANVAS = { width: 1920, height: 1080 } as const;

export type PlacementRect = { x: number; y: number; width: number; height: number };

/**
 * Contain-fit rect of the slide canvas inside a preview frame (letterbox bars
 * when aspects differ). Matches deck `fit()` centering.
 */
export function fittedSlideContentRect(
  frameSize: { width: number; height: number },
  slideCanvas: { width: number; height: number } = TEAMVER_SLIDE_CANVAS,
): PlacementRect {
  if (frameSize.width <= 0 || frameSize.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(
    frameSize.width / slideCanvas.width,
    frameSize.height / slideCanvas.height,
  );
  const width = slideCanvas.width * scale;
  const height = slideCanvas.height * scale;
  return {
    x: (frameSize.width - width) / 2,
    y: (frameSize.height - height) / 2,
    width,
    height,
  };
}

/**
 * Map overlay / preview-frame pixels to slide-canvas coordinates so
 * `position:absolute` values in deck-patch match the user's drawn box.
 * Accounts for letterbox inset when the frame aspect ≠ the slide canvas.
 */
export function scaleBoundsToSlideCanvas(
  bounds: PlacementRect,
  frameSize: { width: number; height: number },
  slideCanvas: { width: number; height: number } = TEAMVER_SLIDE_CANVAS,
): PlacementRect {
  if (frameSize.width <= 0 || frameSize.height <= 0) return bounds;
  const content = fittedSlideContentRect(frameSize, slideCanvas);
  if (content.width <= 0 || content.height <= 0) return bounds;
  const sx = slideCanvas.width / content.width;
  const sy = slideCanvas.height / content.height;
  return {
    x: Math.round((bounds.x - content.x) * sx),
    y: Math.round((bounds.y - content.y) * sy),
    width: Math.max(1, Math.round(bounds.width * sx)),
    height: Math.max(1, Math.round(bounds.height * sy)),
  };
}

/**
 * Normalize preview attachment `pagePosition` to slide-canvas pixels.
 * Overlay captures may store frame pixels (large values) or 0–1 fractions.
 */
export function normalizePagePositionToSlideCanvas(
  position: PlacementRect,
  slideCanvas: { width: number; height: number } = TEAMVER_SLIDE_CANVAS,
): PlacementRect {
  const x = Number(position.x);
  const y = Number(position.y);
  const width = Number(position.width);
  const height = Number(position.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const max = Math.max(Math.abs(x), Math.abs(y), Math.abs(width), Math.abs(height));
  if (max > 0 && max <= 1.5) {
    return {
      x: Math.round(x * slideCanvas.width),
      y: Math.round(y * slideCanvas.height),
      width: Math.max(1, Math.round(width * slideCanvas.width)),
      height: Math.max(1, Math.round(height * slideCanvas.height)),
    };
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}
