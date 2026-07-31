import type { ManualEditRect } from './types';

/** Map iframe content rect to host/canvas overlay coordinates (scale only, origin 0). */
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

/**
 * Actual CSS scale applied to the iframe element by ancestor transforms
 * (toolbar zoom / manual-edit shell). Prefer this over the zoom toolbar value
 * when mapping content ↔ host — the two can diverge (fit-scale, frozen width).
 */
export function measureIframeHostScale(frame: HTMLIFrameElement | null): number {
  if (!frame) return 1;
  const layoutW = frame.offsetWidth;
  if (!(layoutW > 0)) return 1;
  const visualW = frame.getBoundingClientRect().width;
  if (!(visualW > 0)) return 1;
  const scale = visualW / layoutW;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** Iframe top-left inside a host positioning ancestor (e.g. `.manual-edit-workspace`). */
export function measureIframeOffsetInHost(
  frame: HTMLIFrameElement | null,
  host: HTMLElement | null,
): { x: number; y: number } {
  if (!frame || !host) return { x: 0, y: 0 };
  const iframeBox = frame.getBoundingClientRect();
  const hostBox = host.getBoundingClientRect();
  return {
    x: iframeBox.left - hostBox.left,
    y: iframeBox.top - hostBox.top,
  };
}

/**
 * Map an iframe-document content rect into the host ancestor's coordinate space,
 * accounting for the iframe's offset and any CSS scale on the frame.
 *
 * `el.getBoundingClientRect()` inside the iframe is layout/unscaled; the frame's
 * own getBoundingClientRect() is already visually scaled — combine both.
 */
export function contentRectToHostRectInWorkspace(
  rect: ManualEditRect,
  frame: HTMLIFrameElement | null,
  host: HTMLElement | null,
  fallbackScale = 1,
): ManualEditRect {
  const scale = frame ? measureIframeHostScale(frame) : (
    Number.isFinite(fallbackScale) && fallbackScale > 0 ? fallbackScale : 1
  );
  const origin = measureIframeOffsetInHost(frame, host);
  return {
    x: origin.x + rect.x * scale,
    y: origin.y + rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}
