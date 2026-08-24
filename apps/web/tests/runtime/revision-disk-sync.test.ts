// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { syncRevisionWithRetry } from '../../src/runtime/revision-disk-sync';

describe('revision-disk-sync', () => {
  it('retries until sync succeeds', async () => {
    const sync = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const ok = await syncRevisionWithRetry(sync, [0, 0, 0]);
    expect(ok).toBe(true);
    expect(sync).toHaveBeenCalledTimes(3);
  });

  it('returns false after exhausting retries', async () => {
    const sync = vi.fn().mockResolvedValue(false);
    const ok = await syncRevisionWithRetry(sync, [0, 0]);
    expect(ok).toBe(false);
    expect(sync).toHaveBeenCalledTimes(2);
  });
});
