/**
 * Detect failed iframe / compositor captures that return a blank white frame.
 * Used to avoid shipping misleading "slide + mark" PNGs when the background
 * never rendered.
 */

export interface RasterSnapshotLike {
  dataUrl: string;
  w: number;
  h: number;
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Returns true when most sampled pixels are near-white (empty iframe / failed raster).
 */
export async function isPreviewSnapshotMostlyBlank(
  snap: RasterSnapshotLike,
  blankRatioThreshold = 0.94,
  sampleMaxEdge = 128,
): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (!snap.dataUrl || snap.w < 1 || snap.h < 1) return true;

  const img = await loadImageFromDataUrl(snap.dataUrl);
  if (!img) return true;

  const scale = Math.min(1, sampleMaxEdge / Math.max(snap.w, snap.h, 1));
  const w = Math.max(1, Math.round(snap.w * scale));
  const h = Math.max(1, Math.round(snap.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || typeof ctx.getImageData !== 'function') return false;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  let blankPixels = 0;
  const pixelCount = w * h;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (r >= 238 && g >= 238 && b >= 238) blankPixels += 1;
  }
  return blankPixels / pixelCount >= blankRatioThreshold;
}
