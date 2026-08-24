// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_ANTHROPIC_PROXY_IMAGE_BYTES } from '../../src/providers/anthropic-proxy-limits';
import {
  downscaleImageBytesForAnthropicProxy,
  fitPngBlobForAnthropicProxy,
} from '../../src/utils/annotationImage';

describe('annotationImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns small PNG blobs unchanged', async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    await expect(fitPngBlobForAnthropicProxy(blob)).resolves.toBe(blob);
  });

  it('returns small byte payloads unchanged', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    await expect(
      downscaleImageBytesForAnthropicProxy(bytes, 'image/png', MAX_ANTHROPIC_PROXY_IMAGE_BYTES),
    ).resolves.toStrictEqual(bytes);
  });
});
