import { describe, expect, it } from 'vitest';
import {
  clearRevisionContentCacheForFile,
  getRevisionContentCache,
  prefetchRevisionContents,
  REVISION_CONTENT_CACHE_MAX_BYTES_PER_FILE,
  REVISION_CONTENT_CACHE_MAX_ENTRIES_PER_FILE,
  REVISION_CONTENT_CACHE_MAX_ENTRY_BYTES,
  setRevisionContentCache,
  shouldCacheRevisionContent,
} from '../../src/runtime/revision-content-cache';

describe('revision-content-cache', () => {
  it('resolves positive finite cache budget constants', () => {
    expect(REVISION_CONTENT_CACHE_MAX_ENTRIES_PER_FILE).toBeGreaterThan(0);
    expect(REVISION_CONTENT_CACHE_MAX_ENTRY_BYTES).toBeGreaterThan(0);
    expect(REVISION_CONTENT_CACHE_MAX_BYTES_PER_FILE).toBeGreaterThan(0);
    expect(Number.isFinite(REVISION_CONTENT_CACHE_MAX_ENTRIES_PER_FILE)).toBe(true);
  });

  it('stores and retrieves revision content per file', () => {
    clearRevisionContentCacheForFile('p1', 'deck.html');
    setRevisionContentCache('p1', 'deck.html', 'rev-1', '<html>v1</html>');
    expect(getRevisionContentCache('p1', 'deck.html', 'rev-1')).toBe('<html>v1</html>');
    expect(getRevisionContentCache('p1', 'deck.html', 'rev-2')).toBeNull();
  });

  it('clears only the target file entries', () => {
    setRevisionContentCache('p1', 'a.html', 'rev-a', 'a');
    setRevisionContentCache('p1', 'b.html', 'rev-b', 'b');
    clearRevisionContentCacheForFile('p1', 'a.html');
    expect(getRevisionContentCache('p1', 'a.html', 'rev-a')).toBeNull();
    expect(getRevisionContentCache('p1', 'b.html', 'rev-b')).toBe('b');
  });

  it('prefetches missing revision content once', async () => {
    clearRevisionContentCacheForFile('p1', 'deck.html');
    let calls = 0;
    prefetchRevisionContents('p1', 'deck.html', [
      { revisionId: 'rev-1' },
      { revisionId: 'rev-1' },
    ], async (id) => {
      calls += 1;
      return id === 'rev-1' ? '<html>prefetched</html>' : null;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(1);
    expect(getRevisionContentCache('p1', 'deck.html', 'rev-1')).toBe('<html>prefetched</html>');
  });

  it('skips prefetch when revision byteSize exceeds entry cap', async () => {
    clearRevisionContentCacheForFile('p1', 'deck.html');
    let calls = 0;
    prefetchRevisionContents('p1', 'deck.html', [{
      revisionId: 'rev-huge',
      byteSize: REVISION_CONTENT_CACHE_MAX_ENTRY_BYTES + 1,
    }], async () => {
      calls += 1;
      return '<html>huge</html>';
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(0);
    expect(getRevisionContentCache('p1', 'deck.html', 'rev-huge')).toBeNull();
  });

  it('evicts least-recently-used entries beyond the per-file cap', () => {
    clearRevisionContentCacheForFile('p1', 'deck.html');
    for (let index = 0; index < REVISION_CONTENT_CACHE_MAX_ENTRIES_PER_FILE; index += 1) {
      setRevisionContentCache('p1', 'deck.html', `rev-${index}`, `<html>v${index}</html>`);
    }
    getRevisionContentCache('p1', 'deck.html', 'rev-0');
    setRevisionContentCache('p1', 'deck.html', 'rev-new', '<html>new</html>');
    expect(getRevisionContentCache('p1', 'deck.html', 'rev-0')).toBe('<html>v0</html>');
    expect(getRevisionContentCache('p1', 'deck.html', 'rev-1')).toBeNull();
    expect(getRevisionContentCache('p1', 'deck.html', 'rev-new')).toBe('<html>new</html>');
  });

  it('does not cache oversized single revision bodies', () => {
    clearRevisionContentCacheForFile('p1', 'deck.html');
    const huge = 'x'.repeat(REVISION_CONTENT_CACHE_MAX_ENTRY_BYTES + 1);
    expect(shouldCacheRevisionContent(huge)).toBe(false);
    setRevisionContentCache('p1', 'deck.html', 'rev-huge', huge);
    expect(getRevisionContentCache('p1', 'deck.html', 'rev-huge')).toBeNull();
  });
});
