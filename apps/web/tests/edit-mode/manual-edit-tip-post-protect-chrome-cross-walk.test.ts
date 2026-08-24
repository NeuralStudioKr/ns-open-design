/**
 * Tip remount post-protect × chrome-release cross walk (544).
 * Soft-land/absorb must settle to live before chrome-release tracks arm;
 * paint-sync and pointer-unlock then run as parallel tracks (540).
 * Walk bodies shared via tip-remount-sequence-fixtures (547).
 */
import { describe, expect, it } from 'vitest';
import {
  TIP_REMOUNT_CHROME_RELEASE_PREFIX,
  TIP_REMOUNT_PAINT_SYNC_TRACK,
  TIP_REMOUNT_POINTER_UNLOCK_TRACK,
  TIP_REMOUNT_POST_PROTECT_SEQUENCE,
} from '../../src/edit-mode/manual-edit-freeze';
import {
  advanceTipChromeReleaseToLive,
  advanceTipPostProtectToLive,
  createTipChromeSuppressState,
  createTipPostProtectSoftLandState,
} from './tip-remount-sequence-fixtures';

describe('manual-edit tip post-protect × chrome-release cross walk (544)', () => {
  it('pins post-protect then parallel chrome tracks as the cross contract', () => {
    expect([...TIP_REMOUNT_POST_PROTECT_SEQUENCE]).toEqual([
      'sticky-clear',
      'soft-land',
      'exit-latch',
      'absorb',
      'post-absorb-quiet',
      'live',
    ]);
    expect([...TIP_REMOUNT_CHROME_RELEASE_PREFIX]).toEqual([
      'chrome-suppress',
      'fit-remasure',
      'chrome-release',
    ]);
    expect(TIP_REMOUNT_PAINT_SYNC_TRACK.indexOf('geom-epoch-flush')).toBeGreaterThan(
      TIP_REMOUNT_PAINT_SYNC_TRACK.indexOf('paint-sync-hold'),
    );
    expect(TIP_REMOUNT_POINTER_UNLOCK_TRACK.indexOf('post-unlock-quiet')).toBeGreaterThan(
      TIP_REMOUNT_POINTER_UNLOCK_TRACK.indexOf('unlock-pointer-gate'),
    );
    // Cross invariant: geom-epoch is paint-track, not after pointer quiet.
    expect(TIP_REMOUNT_PAINT_SYNC_TRACK).toContain('geom-epoch-flush');
    expect(TIP_REMOUNT_POINTER_UNLOCK_TRACK).not.toContain('geom-epoch-flush');
  });

  it('walks soft-land→live then chrome-release paint∥pointer tracks via shared fixtures', () => {
    const postProtect = advanceTipPostProtectToLive(createTipPostProtectSoftLandState());
    expect(postProtect.softLandRemaining).toBe(0);
    expect(postProtect.exitLatch).toBe(false);
    expect(postProtect.absorb).toBe(false);
    expect(postProtect.quiet).toBe(false);

    const chrome = advanceTipChromeReleaseToLive(createTipChromeSuppressState());
    expect(chrome.chromeSuppressed).toBe(false);
    expect(chrome.paintSyncHold).toBe(false);
    expect(chrome.unlockGate).toBe(false);
    expect(chrome.postUnlockQuiet).toBe(false);
    expect(chrome.deferredEpochBump).toBe(false);
    expect(chrome.deferredGeometryPending).toBe(false);
  });
});
