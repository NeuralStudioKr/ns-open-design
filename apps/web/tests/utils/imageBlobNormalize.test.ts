import { describe, expect, it } from 'vitest';

import { normalizeFetchedImageBlob, sniffImageMime } from '../../src/utils/imageBlobNormalize';

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe('sniffImageMime', () => {
  it('detects PNG from magic bytes', () => {
    expect(sniffImageMime(PNG_HEADER)).toBe('image/png');
  });
});

describe('normalizeFetchedImageBlob', () => {
  it('keeps image/* blobs unchanged when magic bytes match', async () => {
    const input = new Blob([PNG_HEADER], { type: 'image/png' });
    const out = await normalizeFetchedImageBlob(input);
    expect(out?.type).toBe('image/png');
  });

  it('repairs PNG bytes when the server declares the wrong image/* subtype', async () => {
    const input = new Blob([PNG_HEADER, 0x01], { type: 'image/jpeg' });
    const out = await normalizeFetchedImageBlob(input);
    expect(out?.type).toBe('image/png');
  });

  it('repairs PNG bytes served with a wrong MIME type', async () => {
    const input = new Blob([PNG_HEADER, 0x01], { type: 'text/plain' });
    const out = await normalizeFetchedImageBlob(input);
    expect(out?.type).toBe('image/png');
  });

  it('rejects HTML error bodies', async () => {
    const input = new Blob(['<!doctype html>'], { type: 'text/html' });
    const out = await normalizeFetchedImageBlob(input);
    expect(out).toBeNull();
  });

  it('rejects opaque octet-stream without image magic bytes', async () => {
    const input = new Blob(['not an image'], { type: 'application/octet-stream' });
    const out = await normalizeFetchedImageBlob(input);
    expect(out).toBeNull();
  });

  it('accepts PNG bytes served as octet-stream', async () => {
    const input = new Blob([PNG_HEADER, 0x01], { type: 'application/octet-stream' });
    const out = await normalizeFetchedImageBlob(input);
    expect(out?.type).toBe('image/png');
  });
});
