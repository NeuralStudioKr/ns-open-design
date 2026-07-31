import { describe, expect, it } from 'vitest';
import {
  clearRevisionContentCacheForFile,
  getRevisionContentCache,
} from '../../src/runtime/revision-content-cache';
import {
  cacheParentRevisionOnPush,
  canApplyRevisionFromClientCache,
} from '../../src/runtime/revision-restore';

describe('revision-restore', () => {
  it('allows client-only restore when cached snapshot content exists', () => {
    expect(canApplyRevisionFromClientCache('<html>cached</html>')).toBe(true);
  });

  it('requires server restore when cache is empty', () => {
    expect(canApplyRevisionFromClientCache(null)).toBe(false);
    expect(canApplyRevisionFromClientCache(undefined)).toBe(false);
  });

  it('caches parent revision content after push', () => {
    clearRevisionContentCacheForFile('p1', 'deck.html');
    cacheParentRevisionOnPush('p1', 'deck.html', 'rev-parent', '<html>before</html>');
    expect(getRevisionContentCache('p1', 'deck.html', 'rev-parent')).toBe('<html>before</html>');
  });

  it('skips parent cache when parent id is missing', () => {
    clearRevisionContentCacheForFile('p1', 'deck.html');
    cacheParentRevisionOnPush('p1', 'deck.html', null, '<html>before</html>');
    expect(getRevisionContentCache('p1', 'deck.html', 'rev-parent')).toBeNull();
  });
});
