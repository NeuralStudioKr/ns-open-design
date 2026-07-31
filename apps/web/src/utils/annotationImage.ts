import { MAX_ANTHROPIC_PROXY_IMAGE_BYTES } from '../providers/anthropic-proxy-limits';

export type AnthropicProxyImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const DEFAULT_MAX_BYTES = MAX_ANTHROPIC_PROXY_IMAGE_BYTES;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: AnthropicProxyImageMediaType,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const quality = mime === 'image/jpeg' || mime === 'image/webp' ? 0.92 : undefined;
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

async function loadImageFromBytes(
  bytes: Uint8Array,
  mediaType: AnthropicProxyImageMediaType,
): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return null;
  const blob = new Blob([bytes], { type: mediaType });
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function downscaleImageElement(
  image: CanvasImageSource & { width: number; height: number },
  mediaType: AnthropicProxyImageMediaType,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;
  let scale = Math.min(1, Math.sqrt(maxBytes / Math.max(image.width * image.height, 1)) * 0.85);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const width = Math.max(1, Math.floor(image.width * scale));
    const height = Math.max(1, Math.floor(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, mediaType);
    if (!blob) return null;
    if (blob.size <= maxBytes) {
      return new Uint8Array(await blob.arrayBuffer());
    }
    scale *= 0.72;
  }
  return null;
}

/** Shrink annotation screenshots before upload so Anthropic proxy inlining stays reliable. */
export async function fitPngBlobForAnthropicProxy(
  blob: Blob,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<Blob> {
  if (blob.size <= maxBytes) return blob;
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      const bytes = await downscaleImageElement(bitmap, 'image/png', maxBytes);
      if (bytes) return new Blob([bytes], { type: 'image/png' });
    } finally {
      bitmap.close();
    }
  }
  const image = await loadImageFromBytes(new Uint8Array(await blob.arrayBuffer()), 'image/png');
  if (!image) return blob;
  const bytes = await downscaleImageElement(image, 'image/png', maxBytes);
  return bytes ? new Blob([bytes], { type: 'image/png' }) : blob;
}

/** Second-line defense when historical uploads exceed Anthropic inline limits. */
export async function downscaleImageBytesForAnthropicProxy(
  bytes: Uint8Array,
  mediaType: AnthropicProxyImageMediaType,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<Uint8Array | null> {
  if (bytes.length <= maxBytes) return bytes;
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mediaType }));
    try {
      return await downscaleImageElement(bitmap, mediaType, maxBytes);
    } finally {
      bitmap.close();
    }
  }
  const image = await loadImageFromBytes(bytes, mediaType);
  if (!image) return null;
  return downscaleImageElement(image, mediaType, maxBytes);
}
