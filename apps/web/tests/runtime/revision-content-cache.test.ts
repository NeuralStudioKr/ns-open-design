import { describe, expect, it } from 'vitest';
import {
  clearRevisionContentCacheForFile,
  getRevisionContentCache,
  prefetchRevisionContents,
  setRevisionContentCache,
} from '../../src/runtime/revision-content-cache';

describe('revision-content-cache', () => {
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
    prefetchRevisionContents('p1', 'deck.html', ['rev-1', 'rev-1'], async (id) => {
      calls += 1;
      return id === 'rev-1' ? '<html>prefetched</html>' : null;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(1);
    expect(getRevisionContentCache('p1', 'deck.html', 'rev-1')).toBe('<html>prefetched</html>');
  });
});
