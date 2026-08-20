import { describe, expect, it, vi } from 'vitest';
import { PROMOTE_MOVE_STYLE_KEYS } from '../../src/edit-mode/move-math';
import {
  keyedManualEditStyleRollback,
  manualEditGestureRollbackKeys,
  manualEditPendingAffectedIds,
  manualEditPendingStyleEntries,
  restoreManualEditPendingStyleAfterFailedFlush,
  shouldFlushManualEditStylesOnTargetBoundary,
  shouldResetManualEditPanelPinOnSelect,
  shouldSkipManualEditStyleFlushWhilePaused,
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

  it('skips soft flush while geometry gestures pause autosave', () => {
    expect(shouldSkipManualEditStyleFlushWhilePaused(true)).toBe(true);
    expect(shouldSkipManualEditStyleFlushWhilePaused(true, { force: true })).toBe(false);
    expect(shouldSkipManualEditStyleFlushWhilePaused(false)).toBe(false);
  });

  it('resets the floating panel pin only when the selected id changes', () => {
    expect(shouldResetManualEditPanelPinOnSelect('hero', 'cta')).toBe(true);
    expect(shouldResetManualEditPanelPinOnSelect('hero', 'hero')).toBe(false);
    expect(shouldResetManualEditPanelPinOnSelect(null, 'hero')).toBe(true);
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

  it('uses promote keys when stylesBefore captured position (flush-fail / Esc)', () => {
    expect(manualEditGestureRollbackKeys({
      position: '',
      left: '10px',
      top: '20px',
    }, PROMOTE_MOVE_STYLE_KEYS)).toEqual([...PROMOTE_MOVE_STYLE_KEYS]);
  });

  it('rolls back only recorded keys for absolute move / resize gestures', () => {
    expect(manualEditGestureRollbackKeys({
      left: '40px',
      top: '60px',
      right: '',
      bottom: '',
    }, PROMOTE_MOVE_STYLE_KEYS)).toEqual(['left', 'top', 'right', 'bottom']);
    expect(keyedManualEditStyleRollback({
      width: '200px',
      height: '100px',
      left: '',
      top: '',
    }, ['width', 'height', 'left', 'top'])).toEqual({
      width: '200px',
      height: '100px',
      left: '',
      top: '',
    });
  });

  it('fills missing stylesBefore values with empty so preview removeProperty clears them', () => {
    expect(keyedManualEditStyleRollback({ left: '40px' }, ['left', 'top', 'position'])).toEqual({
      left: '40px',
      top: '',
      position: '',
    });
  });

  it('expands per-target pending style entries for cancel/reconcile', () => {
    const pending = {
      id: 'b',
      perTargetStyles: {
        a: { zIndex: '2', position: 'relative' },
        b: { zIndex: '3' },
      },
      styles: {},
    };
    expect(manualEditPendingStyleEntries(pending)).toEqual([
      { id: 'a', styles: { zIndex: '2', position: 'relative' } },
      { id: 'b', styles: { zIndex: '3' } },
    ]);
    expect(manualEditPendingAffectedIds(pending)).toEqual(['a', 'b']);
  });
});
