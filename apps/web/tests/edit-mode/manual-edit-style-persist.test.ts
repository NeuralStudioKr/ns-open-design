import { describe, expect, it } from 'vitest';
import {
  restoreManualEditPendingStyleAfterFailedFlush,
  shouldFlushManualEditStylesOnTargetBoundary,
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
});
