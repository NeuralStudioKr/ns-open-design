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

  it('skips replay when frozen and saved colors are canonically equivalent', () => {
    const frozenRgb = '<!doctype html><html><body><main data-od-id="hero" style="color: rgb(239, 68, 68);">Hero</main></body></html>';
    const savedHex = '<!doctype html><html><body><main data-od-id="hero" style="color: #ef4444;">Hero</main></body></html>';
    expect(manualEditStyleReplayPatches(frozenRgb, savedHex)).toEqual([]);
    expect(manualEditStyleReplayPatches(savedHex, frozenRgb)).toEqual([]);
  });

  it('replays path-* targets annotated on freeze but missing as attrs on saved HTML', () => {
    // path-0 = body.children[0]; freeze carries the preview annotation.
    const frozenPath =
      '<!doctype html><html><body><p data-od-id="path-0">Copy</p></body></html>';
    const savedPath =
      '<!doctype html><html><body><p style="font-size: 28px;">Copy</p></body></html>';
    const patches = manualEditStyleReplayPatches(frozenPath, savedPath);
    expect(patches.some((p) => p.id === 'path-0' && /28/.test(String(p.styles.fontSize || '')))).toBe(
      true,
    );
  });

  it('does not emit clear patches for freeze-only ghost ids missing from saved HTML', () => {
    const frozen =
      '<!doctype html><html><body><main data-od-id="ghost" style="font-size: 22px;">Ghost</main></body></html>';
    const saved = '<!doctype html><html><body><p data-od-id="hero">Hero</p></body></html>';
    const patches = manualEditStyleReplayPatches(frozen, saved);
    expect(patches.some((p) => p.id === 'ghost')).toBe(false);
    expect(patches.every((p) => Object.values(p.styles).every((v) => String(v || '').trim()))).toBe(
      true,
    );
  });

  it('parses freeze and saved once for multi-id decks', () => {
    const frozen = `<!doctype html><html><body>
<main data-od-id="a">A</main><p data-od-id="b">B</p><span data-od-id="c">C</span>
</body></html>`;
    const saved = `<!doctype html><html><body>
<main data-od-id="a" style="font-size: 20px;">A</main>
<p data-od-id="b" style="color: rgb(1, 2, 3);">B</p>
<span data-od-id="c" style="font-weight: 700;">C</span>
</body></html>`;
    const original = DOMParser.prototype.parseFromString;
    let parses = 0;
    DOMParser.prototype.parseFromString = function (...args: Parameters<typeof original>) {
      parses += 1;
      return original.apply(this, args);
    };
    try {
      const patches = manualEditStyleReplayPatches(frozen, saved);
      expect(patches.length).toBeGreaterThanOrEqual(2);
      // One Document each for freeze + saved (not N× per id).
      expect(parses).toBe(2);
    } finally {
      DOMParser.prototype.parseFromString = original;
    }
  });
});
