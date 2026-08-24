import { describe, expect, it } from 'vitest';

import { imageViewerCanOpen } from '../../src/components/FileViewer';

describe('ImageViewer open/download presign split', () => {
  it('enables Open as soon as a signed URL is ready', () => {
    expect(
      imageViewerCanOpen({
        useAuthenticatedFetch: true,
        signedLoading: true,
        signedSrc: 'https://bucket.s3.amazonaws.com/a.png?X-Amz-Signature=1',
        busy: false,
      }),
    ).toBe(true);
  });

  it('keeps Open disabled while presign is still loading without a URL', () => {
    expect(
      imageViewerCanOpen({
        useAuthenticatedFetch: true,
        signedLoading: true,
        signedSrc: null,
        busy: false,
      }),
    ).toBe(false);
  });

  it('allows Open after presign settles so click can fall back to blob fetch', () => {
    expect(
      imageViewerCanOpen({
        useAuthenticatedFetch: true,
        signedLoading: false,
        signedSrc: null,
        busy: false,
      }),
    ).toBe(true);
  });

  it('does not gate Open on authenticated fetch outside Teamver embed', () => {
    expect(
      imageViewerCanOpen({
        useAuthenticatedFetch: false,
        signedLoading: false,
        signedSrc: null,
        busy: false,
      }),
    ).toBe(true);
  });
});
