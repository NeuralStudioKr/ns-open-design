/** Teamver slide decks use a fixed 1920×1080 canvas in deck.html. */
export const TEAMVER_SLIDE_CANVAS = { width: 1920, height: 1080 } as const;

export type PlacementRect = { x: number; y: number; width: number; height: number };

/**
 * Map overlay / preview-frame pixels to slide-canvas coordinates so
 * `position:absolute` values in deck-patch match the user's drawn box.
 */
export function scaleBoundsToSlideCanvas(
  bounds: PlacementRect,
  frameSize: { width: number; height: number },
  slideCanvas: { width: number; height: number } = TEAMVER_SLIDE_CANVAS,
): PlacementRect {
  if (frameSize.width <= 0 || frameSize.height <= 0) return bounds;
  const sx = slideCanvas.width / frameSize.width;
  const sy = slideCanvas.height / frameSize.height;
  return {
    x: Math.round(bounds.x * sx),
    y: Math.round(bounds.y * sy),
    width: Math.max(1, Math.round(bounds.width * sx)),
    height: Math.max(1, Math.round(bounds.height * sy)),
  };
}
