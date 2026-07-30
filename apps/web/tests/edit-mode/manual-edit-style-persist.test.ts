import { describe, expect, it, vi } from 'vitest';
import {
  restoreManualEditPendingStyleAfterFailedFlush,
  shouldFlushManualEditStylesOnTargetBoundary,
  waitForManualEditSaveIdle,
} from '../../src/edit-mode/manual-edit-style-persist';

describe('manual edit style persist boundary', () => {
  it('flushes when selecting a different target than the pending draft', () => {
    expect(shouldFlushManualEditStylesOnTargetBoundary('hero', 'cta')).toBe(true);
  });

  it('does not flush when re-selecting the same pending target', () => {
    expect(shouldFlushManualEditStylesOnTargetBoundary('hero', 'hero')).toBe(false);
  });

  it('flushes when clearing selection while a draft is pending', () => {
    expect(shouldFlushManualEditStylesOnTargetBoundary('hero', null)).toBe(true);
  });

  it('restores the flushed draft after a failed save when nothing newer was queued', () => {
    const flushed = {
      id: 'hero',
      styles: { fontSize: '18px' },
      label: 'Style',
      version: 1,
    };
    expect(restoreManualEditPendingStyleAfterFailedFlush(null, flushed)).toEqual(flushed);
  });

  it('keeps a newer draft queued during the failed save', () => {
    const flushed = {
      id: 'hero',
      styles: { fontSize: '18px' },
      label: 'Style',
      version: 1,
    };
    const newer = {
      id: 'hero',
      styles: { fontSize: '20px' },
      label: 'Style',
      version: 2,
    };
    expect(restoreManualEditPendingStyleAfterFailedFlush(newer, flushed)).toEqual(newer);
  });

  it('waits for an in-flight save lock to clear before boundary flushes continue', async () => {
    let busy = true;
    let now = 0;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
      if (now >= 48) busy = false;
    });
    await expect(waitForManualEditSaveIdle(() => busy, {
      pollMs: 16,
      timeoutMs: 200,
      now: () => now,
      sleep,
    })).resolves.toBe(true);
    expect(busy).toBe(false);
  });

  it('times out when the save lock never clears', async () => {
    let now = 0;
    await expect(waitForManualEditSaveIdle(() => true, {
      pollMs: 10,
      timeoutMs: 30,
      now: () => now,
      sleep: async (ms) => { now += ms; },
    })).resolves.toBe(false);
  });
});
