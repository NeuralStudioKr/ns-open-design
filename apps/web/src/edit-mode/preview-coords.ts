import type { ManualEditRect } from './types';

/** Normalize previewScale; non-finite / non-positive → 1. */
export function normalizePreviewScale(previewScale: number): number {
  return Number.isFinite(previewScale) && previewScale > 0 ? previewScale : 1;
}

/** iframe content rect → host/canvas rect (`manualEditFloatingPanelStyle` basis). */
export function contentRectToHostRect(
  rect: ManualEditRect,
  previewScale: number,
): ManualEditRect {
  const s = normalizePreviewScale(previewScale);
  return {
    x: rect.x * s,
    y: rect.y * s,
    width: rect.width * s,
    height: rect.height * s,
  };
}

/** Host pointer delta → content (iframe) delta. */
export function hostDeltaToContentDelta(
  dx: number,
  dy: number,
  previewScale: number,
): { dx: number; dy: number } {
  const s = normalizePreviewScale(previewScale);
  return { dx: dx / s, dy: dy / s };
}
