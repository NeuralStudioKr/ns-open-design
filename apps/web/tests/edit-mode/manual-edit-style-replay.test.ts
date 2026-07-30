// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { manualEditStyleReplayPatches } from '../../src/edit-mode/manual-edit-style-replay';

describe('manual edit style replay against freeze', () => {
  const frozen = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
  const saved = '<!doctype html><html><body><main data-od-id="hero" style="font-size: 18px; color: rgb(17, 17, 17);">Hero</main></body></html>';

  it('emits style diffs present in saved source but missing from the freeze', () => {
    const patches = manualEditStyleReplayPatches(frozen, saved);
    expect(patches).toHaveLength(1);
    expect(patches[0]?.id).toBe('hero');
    expect(patches[0]?.styles.fontSize).toMatch(/18/);
    expect(patches[0]?.styles.color).toBeTruthy();
  });

  it('returns nothing when freeze already matches saved source', () => {
    expect(manualEditStyleReplayPatches(saved, saved)).toEqual([]);
  });

  it('returns nothing when either snapshot is missing', () => {
    expect(manualEditStyleReplayPatches(null, saved)).toEqual([]);
    expect(manualEditStyleReplayPatches(frozen, null)).toEqual([]);
  });
});
