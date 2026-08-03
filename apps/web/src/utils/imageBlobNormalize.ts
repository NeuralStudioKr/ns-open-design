const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Detect image type from magic bytes when Content-Type is missing or wrong. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 6) {
    const gif = String.fromCharCode(...bytes.slice(0, 6));
    if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  }
  if (bytes.length >= 4) {
    const marker = String.fromCharCode(...bytes.slice(0, 4));
    if (marker === '<svg' || marker.startsWith('<?xm')) return 'image/svg+xml';
  }
  return null;
}

/**
 * Normalize a fetched raw file body into an image blob the browser can render.
 * Teamver/S3 responses sometimes return valid PNG bytes with a non-image MIME
 * (or the wrong image/* subtype), which made `<img>` show only alt text.
 */
export async function normalizeFetchedImageBlob(blob: Blob): Promise<Blob | null> {
  if (blob.size <= 0) return null;

  const mime = String(blob.type || '').toLowerCase();
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const sniffed = sniffImageMime(bytes);
  if (sniffed) {
    if (sniffed === mime) return blob;
    return new Blob([buffer], { type: sniffed });
  }
  if (mime.startsWith('image/')) return blob;

  if (mime === '' || mime === 'application/octet-stream') {
    // Do not label arbitrary bytes as PNG — error HTML / truncated uploads
    // must not render as a broken image tile in chat or the file viewer.
    return null;
  }
  return null;
}

/** Build a data URL with a renderable image/* MIME for `<img src>`. */
export async function blobToImageDataUrl(blob: Blob): Promise<string | null> {
  if (typeof FileReader === 'undefined') return null;
  let normalized = blob;
  const mime = String(blob.type || '').toLowerCase();
  if (!mime.startsWith('image/')) {
    const buffer = await blob.arrayBuffer();
    const sniffed = sniffImageMime(new Uint8Array(buffer));
    if (sniffed) {
      normalized = new Blob([buffer], { type: sniffed });
    } else if (mime === '' || mime === 'application/octet-stream') {
      return null;
    }
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(normalized);
  });
}
