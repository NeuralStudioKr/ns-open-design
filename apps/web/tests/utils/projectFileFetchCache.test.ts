import { describe, expect, it } from 'vitest';

import {
  clearProjectRawFileMissing,
  isProjectRawFileKnownMissing,
  markProjectRawFileMissing,
  reconcileProjectRawFileMissingCache,
  resetProjectRawFileFetchCacheForTests,
} from '../../src/utils/projectFileFetchCache';

describe('projectFileFetchCache', () => {
  it('clears stale missing marks when the project index lists the path', () => {
    resetProjectRawFileFetchCacheForTests();
    const projectId = 'project-1';
    const path = 'uploads/screenshot.png';
    markProjectRawFileMissing(projectId, path);
    expect(isProjectRawFileKnownMissing(projectId, path)).toBe(true);

    reconcileProjectRawFileMissingCache(projectId, new Set(['uploads/screenshot.png']));
    expect(isProjectRawFileKnownMissing(projectId, path)).toBe(false);
  });

  it('clears missing marks for basename matches in nested indexes', () => {
    resetProjectRawFileFetchCacheForTests();
    const projectId = 'project-1';
    const path = 'screenshot.png';
    markProjectRawFileMissing(projectId, path);

    reconcileProjectRawFileMissingCache(projectId, new Set(['uploads/screenshot.png']));
    expect(isProjectRawFileKnownMissing(projectId, path)).toBe(false);
  });

  it('keeps missing marks when the path is still absent from the index', () => {
    resetProjectRawFileFetchCacheForTests();
    const projectId = 'project-1';
    const path = 'uploads/missing.png';
    markProjectRawFileMissing(projectId, path);

    reconcileProjectRawFileMissingCache(projectId, new Set(['uploads/other.png']));
    expect(isProjectRawFileKnownMissing(projectId, path)).toBe(true);
    clearProjectRawFileMissing(projectId, path);
  });
});
