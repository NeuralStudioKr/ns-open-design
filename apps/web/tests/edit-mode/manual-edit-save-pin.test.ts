import { describe, expect, it } from 'vitest';
import {
  MANUAL_EDIT_SAVE_PIN_MS,
  createManualEditSourcePin,
  isManualEditSourcePinFresh,
  manualEditHistoryConfirmTrustsLocal,
  preferManualEditPinnedSource,
} from '../../src/edit-mode/manual-edit-save-pin';

describe('manual edit save pin', () => {
  const saved = '<html><body><h1>Edited</h1></body></html>';
  const stale = '<html><body><h1>Original</h1></body></html>';

  it('prefers the pinned source when a post-save refetch returns stale HTML', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    expect(preferManualEditPinnedSource(pinned, stale, 1_000 + 100)).toBe(saved);
  });

  it('prefers the pinned source when a post-save refetch returns null', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    expect(preferManualEditPinnedSource(pinned, null, 1_000 + 100)).toBe(saved);
  });

  it('does not override when the refetch already matches the pin', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    expect(preferManualEditPinnedSource(pinned, saved, 1_000 + 100)).toBeNull();
  });

  it('expires after the grace window so later disk wins', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    const now = 1_000 + MANUAL_EDIT_SAVE_PIN_MS;
    expect(isManualEditSourcePinFresh(pinned, now)).toBe(false);
    expect(preferManualEditPinnedSource(pinned, stale, now)).toBeNull();
  });

  it('lets history confirm trust a pinned local save over a lagging GET', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    expect(manualEditHistoryConfirmTrustsLocal(saved, stale, pinned, 1_000 + 50)).toBe(true);
    expect(manualEditHistoryConfirmTrustsLocal(saved, stale, pinned, 1_000 + MANUAL_EDIT_SAVE_PIN_MS)).toBe(false);
    expect(manualEditHistoryConfirmTrustsLocal(saved, saved, null)).toBe(true);
  });
});
