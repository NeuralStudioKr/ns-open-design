// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearProjectRawFileMissing,
  isProjectRawFileKnownMissing,
  markProjectRawFileMissing,
  reconcileProjectRawFileMissingCache,
  resetProjectRawFileFetchCacheForTests,
} from '../../src/utils/projectFileFetchCache';

describe('projectFileFetchCache', () => {
  beforeEach(() => {
    resetProjectRawFileFetchCacheForTests();
  });

  it('persists missing marks to sessionStorage for reload survival', () => {
    const path = 'mse7c6na-drawing-2026-08-04T05-12-44-933Z.png';
    markProjectRawFileMissing('project-1', path);
    expect(isProjectRawFileKnownMissing('project-1', path)).toBe(true);
    const raw = sessionStorage.getItem('open-design:missing-project-raw-files:v1');
    expect(raw).toContain(path);
    expect(JSON.parse(String(raw))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('project-1::'),
        expect.stringContaining(path),
      ]),
    );
  });

  it('clears stale missing marks when the project index lists the path', () => {
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

  it('marks drawing screenshots and their alternate paths as missing', () => {
    resetProjectRawFileFetchCacheForTests();
    const projectId = 'project-1';
    const path = 'mse7c6na-drawing-2026-08-04T05-12-44-933Z.png';
    markProjectRawFileMissing(projectId, path);
    expect(isProjectRawFileKnownMissing(projectId, path)).toBe(true);
    expect(isProjectRawFileKnownMissing(projectId, `uploads/${path}`)).toBe(true);
    clearProjectRawFileMissing(projectId, path);
  });

  it('keeps missing marks for indexed drawing screenshots', () => {
    resetProjectRawFileFetchCacheForTests();
    const projectId = 'project-1';
    const path = 'mse7c6na-drawing-2026-08-04T05-12-44-933Z.png';
    markProjectRawFileMissing(projectId, path);

    reconcileProjectRawFileMissingCache(projectId, new Set([path]));
    expect(isProjectRawFileKnownMissing(projectId, path)).toBe(true);
    clearProjectRawFileMissing(projectId, path);
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

  it('short-circuits refs/drive alternate probing once basename is missing', () => {
    resetProjectRawFileFetchCacheForTests();
    const projectId = 'project-1';
    const basename = 'msh9rso1-서빙하는-금붕어.webp';
    markProjectRawFileMissing(projectId, basename);
    // Chat send / preview upgrade may probe under refs/drive/ or uploads/ later —
    // those variants must also short-circuit without a fresh 404 storm.
    expect(isProjectRawFileKnownMissing(projectId, `refs/drive/${basename}`)).toBe(true);
    expect(isProjectRawFileKnownMissing(projectId, `refs/${basename}`)).toBe(true);
    expect(isProjectRawFileKnownMissing(projectId, `uploads/${basename}`)).toBe(true);
  });

  it('short-circuits NFC/NFD sibling paths after either form was marked missing', () => {
    resetProjectRawFileFetchCacheForTests();
    const projectId = 'project-1';
    const nfc = 'msh9rso1-서빙하는-금붕어.webp';
    const nfd = nfc.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    markProjectRawFileMissing(projectId, nfc);
    expect(isProjectRawFileKnownMissing(projectId, nfd)).toBe(true);
    expect(isProjectRawFileKnownMissing(projectId, `refs/drive/${nfd}`)).toBe(true);
  });
});
