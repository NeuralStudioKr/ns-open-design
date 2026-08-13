import { describe, expect, it } from 'vitest';

import { resolveProjectPatchUpdatedAt } from '../src/db.js';

const existing = {
  updatedAt: 1_700_000_000_000,
  name: 'Deck',
  skillId: null as string | null,
  designSystemId: null as string | null,
  pendingPrompt: null as string | null,
  metadata: { kind: 'deck' as const },
  customInstructions: null as string | null,
};

describe('resolveProjectPatchUpdatedAt', () => {
  it('bumps on empty activity patch (message PUT / comments)', () => {
    const before = Date.now();
    const next = resolveProjectPatchUpdatedAt(existing, {});
    expect(next).toBeGreaterThanOrEqual(before);
  });

  it('preserves timestamp for pendingPrompt-only clear (no-op)', () => {
    expect(
      resolveProjectPatchUpdatedAt(existing, { pendingPrompt: null }),
    ).toBe(existing.updatedAt);
  });

  it('preserves timestamp when clearing a real pendingPrompt seed', () => {
    expect(
      resolveProjectPatchUpdatedAt(
        { ...existing, pendingPrompt: 'make slides' },
        { pendingPrompt: null },
      ),
    ).toBe(existing.updatedAt);
  });

  it('honors explicit updatedAt', () => {
    expect(
      resolveProjectPatchUpdatedAt(existing, {
        pendingPrompt: null,
        updatedAt: 42,
      }),
    ).toBe(42);
  });

  it('bumps when name changes', () => {
    const before = Date.now();
    const next = resolveProjectPatchUpdatedAt(existing, { name: 'Renamed' });
    expect(next).toBeGreaterThanOrEqual(before);
  });

  it('does not bump when metadata is semantically equal with different key order', () => {
    expect(
      resolveProjectPatchUpdatedAt(
        { ...existing, metadata: { kind: 'deck', entryFile: 'deck.html' } },
        { metadata: { entryFile: 'deck.html', kind: 'deck' } },
      ),
    ).toBe(existing.updatedAt);
  });

  it('bumps when metadata content changes', () => {
    const before = Date.now();
    const next = resolveProjectPatchUpdatedAt(existing, {
      metadata: { kind: 'deck', entryFile: 'deck.html' },
    });
    expect(next).toBeGreaterThanOrEqual(before);
  });
});
