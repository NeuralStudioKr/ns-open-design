import { describe, expect, it } from 'vitest';
import {
  shouldClearManualEditFrozenSourceOnModeChange,
  shouldSyncManualEditFrozenSourceToPainted,
  shouldUpdateManualEditFrozenSourceOnPatch,
} from '../../src/edit-mode/manual-edit-freeze';

describe('manual edit freeze reset', () => {
  it('clears the entry freeze when leaving edit mode', () => {
    expect(shouldClearManualEditFrozenSourceOnModeChange(true, false)).toBe(true);
  });

  it('clears the entry freeze when re-entering so the next snapshot is fresh', () => {
    // Re-enter after a style save: previous freeze still holds pre-style HTML.
    // Clearing forces the freeze effect to capture the updated live source.
    expect(shouldClearManualEditFrozenSourceOnModeChange(false, true)).toBe(true);
  });

  it('does not clear when the mode value is unchanged', () => {
    expect(shouldClearManualEditFrozenSourceOnModeChange(true, true)).toBe(false);
    expect(shouldClearManualEditFrozenSourceOnModeChange(false, false)).toBe(false);
  });

  it('does not remount the freeze on set-style saves', () => {
    expect(shouldUpdateManualEditFrozenSourceOnPatch('set-style')).toBe(false);
    expect(shouldUpdateManualEditFrozenSourceOnPatch('set-text')).toBe(true);
    expect(shouldUpdateManualEditFrozenSourceOnPatch('set-outer-html')).toBe(true);
    expect(shouldUpdateManualEditFrozenSourceOnPatch('remove-element')).toBe(true);
  });

  it('syncs freeze to painted tip/external refresh while edit mode is on', () => {
    const frozen = '<html>old</html>';
    const tip = '<html>tip</html>';
    expect(shouldSyncManualEditFrozenSourceToPainted(true, frozen, tip)).toBe(true);
    expect(shouldSyncManualEditFrozenSourceToPainted(true, tip, tip)).toBe(false);
    expect(shouldSyncManualEditFrozenSourceToPainted(false, frozen, tip)).toBe(false);
    expect(shouldSyncManualEditFrozenSourceToPainted(true, null, tip)).toBe(false);
  });
});
