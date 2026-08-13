import { describe, expect, it } from 'vitest';
import {
  shouldClearManualEditFrozenSourceOnModeChange,
  shouldEchoManualEditSelectionAfterFreezeSync,
  shouldReseedManualEditMultiInspectorAfterFreezeSync,
  shouldSkipWildJumpAfterTipRemountGrace,
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

  it('echoes selection after freeze tip-yield remount when ids remain', () => {
    expect(shouldEchoManualEditSelectionAfterFreezeSync(true, ['a'])).toBe(true);
    expect(shouldEchoManualEditSelectionAfterFreezeSync(true, ['a', 'b'])).toBe(true);
    expect(shouldEchoManualEditSelectionAfterFreezeSync(true, [])).toBe(false);
    expect(shouldEchoManualEditSelectionAfterFreezeSync(false, ['a'])).toBe(false);
  });

  it('reseeds multi Mixed after freeze tip-yield only when 2+ selected', () => {
    expect(shouldReseedManualEditMultiInspectorAfterFreezeSync(true, ['a', 'b'])).toBe(true);
    expect(shouldReseedManualEditMultiInspectorAfterFreezeSync(true, ['a'])).toBe(false);
    expect(shouldReseedManualEditMultiInspectorAfterFreezeSync(false, ['a', 'b'])).toBe(false);
  });

  it('skips wild-jump deny during tip-remount geometry grace', () => {
    expect(shouldSkipWildJumpAfterTipRemountGrace('el-1', 'el-1', 'el-1', 1_000, 1_800)).toBe(true);
    // Sibling multi-select remasure must not consume another element's grace.
    expect(shouldSkipWildJumpAfterTipRemountGrace('el-1', 'el-2', 'el-1', 1_000, 1_800)).toBe(false);
    expect(shouldSkipWildJumpAfterTipRemountGrace('el-1', 'el-1', 'el-2', 1_000, 1_800)).toBe(false);
    expect(shouldSkipWildJumpAfterTipRemountGrace('el-1', 'el-1', 'el-1', 2_000, 1_800)).toBe(false);
    expect(shouldSkipWildJumpAfterTipRemountGrace(null, 'el-1', 'el-1', 1_000, 1_800)).toBe(false);
    expect(shouldSkipWildJumpAfterTipRemountGrace('el-1', 'el-1', null, 1_000, 1_800)).toBe(false);
  });
});
