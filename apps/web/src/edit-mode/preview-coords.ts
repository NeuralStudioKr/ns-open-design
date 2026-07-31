import type { ManualEditRect } from './types';

/** Map iframe content rect to host/canvas overlay coordinates. */
export function contentRectToHostRect(rect: ManualEditRect, previewScale: number): ManualEditRect {
  const scale = Number.isFinite(previewScale) && previewScale > 0 ? previewScale : 1;
  return {
    x: rect.x * scale,
    y: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

/** Convert pointer delta in host px to content-space delta. */
export function hostDeltaToContentDelta(
  dx: number,
  dy: number,
  previewScale: number,
): { dx: number; dy: number } {
  const scale = Number.isFinite(previewScale) && previewScale > 0 ? previewScale : 1;
  return { dx: dx / scale, dy: dy / scale };
}
