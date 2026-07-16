import { afterEach, describe, expect, it } from 'vitest';

import {
  computeExportCacheKey,
  currentExportCodeVersion,
  normalizeEntryFile,
  shortCacheKeyPrefix,
} from '../src/export-cache-key.js';

describe('export cache key', () => {
  afterEach(() => {
    delete process.env.OD_EXPORT_CACHE_VERSION;
  });

  it('produces stable sha256 hex (64 chars)', () => {
    const key = computeExportCacheKey({
      projectId: 'p-1',
      entryFile: 'index.html',
      mtimeMs: 1_720_000_000_000,
      format: 'pdf',
      deck: false,
    });
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for identical inputs', () => {
    const input = {
      projectId: 'p-1',
      entryFile: 'index.html',
      mtimeMs: 1_720_000_000_000,
      format: 'pdf' as const,
      deck: false,
    };
    expect(computeExportCacheKey(input)).toBe(computeExportCacheKey(input));
  });

  it('normalizes leading slashes and duplicate slashes so drift does not miss', () => {
    const a = computeExportCacheKey({
      projectId: 'p-1',
      entryFile: '/dist/index.html',
      mtimeMs: 100,
      format: 'pdf',
      deck: false,
    });
    const b = computeExportCacheKey({
      projectId: 'p-1',
      entryFile: 'dist//index.html',
      mtimeMs: 100,
      format: 'pdf',
      deck: false,
    });
    expect(a).toBe(b);
    expect(normalizeEntryFile('/dist//x.html')).toBe('dist/x.html');
  });

  it('separates deck vs flat and image slide indexes', () => {
    const base = {
      projectId: 'p-1',
      entryFile: 'x.html',
      mtimeMs: 1,
      format: 'png' as const,
    };
    const deckKey = computeExportCacheKey({ ...base, deck: true });
    const flatKey = computeExportCacheKey({ ...base, deck: false });
    const slide0 = computeExportCacheKey({ ...base, deck: true, slideIndex: 0 });
    const slide1 = computeExportCacheKey({ ...base, deck: true, slideIndex: 1 });
    expect(deckKey).not.toBe(flatKey);
    expect(slide0).not.toBe(slide1);
    expect(slide0).not.toBe(deckKey);
  });

  it('separates tenants (projectId) even for identical entries', () => {
    const shared = {
      entryFile: 'index.html',
      mtimeMs: 1,
      format: 'pdf' as const,
      deck: false,
    };
    expect(computeExportCacheKey({ ...shared, projectId: 'a' })).not.toBe(
      computeExportCacheKey({ ...shared, projectId: 'b' }),
    );
  });

  it('bumps on OD_EXPORT_CACHE_VERSION change (forced miss)', () => {
    const input = {
      projectId: 'p-1',
      entryFile: 'x.html',
      mtimeMs: 1,
      format: 'pdf' as const,
      deck: false,
    };
    process.env.OD_EXPORT_CACHE_VERSION = 'v1';
    const v1 = computeExportCacheKey(input);
    process.env.OD_EXPORT_CACHE_VERSION = 'v2';
    const v2 = computeExportCacheKey(input);
    expect(v1).not.toBe(v2);
  });

  it('short prefix is stable 12 hex chars', () => {
    const key = computeExportCacheKey({
      projectId: 'p-1',
      entryFile: 'x.html',
      mtimeMs: 1,
      format: 'pdf',
      deck: false,
    });
    expect(shortCacheKeyPrefix(key)).toHaveLength(12);
  });

  it('defaults codeVersion to "v8" when env is absent', () => {
    delete process.env.OD_EXPORT_CACHE_VERSION;
    expect(currentExportCodeVersion()).toBe('v8');
  });
});
