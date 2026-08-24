/**
 * `@open-design/web` `pretest` rebuilds contracts, but `pnpm exec vitest`
 * bypasses that hook. Stale contracts dist used to export undefined
 * `REVISION_CONTENT_CACHE_MAX_*` and silently disable revision caching.
 */
import { describe, expect, it } from 'vitest';
import {
  REVISION_CONTENT_CACHE_MAX_BYTES_PER_FILE_DEFAULT,
  REVISION_CONTENT_CACHE_MAX_ENTRIES_PER_FILE_DEFAULT,
  REVISION_CONTENT_CACHE_MAX_ENTRY_BYTES_DEFAULT,
} from '@open-design/contracts';

describe('contracts dist freshness', () => {
  it('exports positive revision content cache budget defaults', () => {
    expect(typeof REVISION_CONTENT_CACHE_MAX_ENTRIES_PER_FILE_DEFAULT).toBe('number');
    expect(typeof REVISION_CONTENT_CACHE_MAX_ENTRY_BYTES_DEFAULT).toBe('number');
    expect(typeof REVISION_CONTENT_CACHE_MAX_BYTES_PER_FILE_DEFAULT).toBe('number');
    expect(REVISION_CONTENT_CACHE_MAX_ENTRIES_PER_FILE_DEFAULT).toBeGreaterThan(0);
    expect(REVISION_CONTENT_CACHE_MAX_ENTRY_BYTES_DEFAULT).toBeGreaterThan(0);
    expect(REVISION_CONTENT_CACHE_MAX_BYTES_PER_FILE_DEFAULT).toBeGreaterThan(0);
  });
});
