import { describe, expect, it } from 'vitest';

import { invalidateCachedPreviewSource } from '../../src/components/FileViewer';

describe('invalidateCachedPreviewSource', () => {
  it('is safe to call when no cache entry exists', () => {
    expect(() => invalidateCachedPreviewSource('project-1', 'deck.html')).not.toThrow();
  });
});
