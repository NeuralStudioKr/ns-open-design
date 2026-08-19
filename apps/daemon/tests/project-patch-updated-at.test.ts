import { describe, expect, it } from 'vitest';

import {
  messageUpsertIsProjectActivity,
  resolveProjectPatchUpdatedAt,
} from '../src/db.js';

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
  it('preserves timestamp on empty patch (open / identical re-PUT)', () => {
    expect(resolveProjectPatchUpdatedAt(existing, {})).toBe(existing.updatedAt);
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

describe('messageUpsertIsProjectActivity', () => {
  it('treats a new message as activity', () => {
    expect(
      messageUpsertIsProjectActivity(null, { content: 'hello', runStatus: 'succeeded' }),
    ).toBe(true);
  });

  it('ignores an identical re-PUT', () => {
    expect(
      messageUpsertIsProjectActivity(
        { content: 'hello', runStatus: 'succeeded', endedAt: 10, producedFiles: [] },
        { content: 'hello', runStatus: 'succeeded', endedAt: 10, producedFiles: [] },
      ),
    ).toBe(false);
  });

  it('treats content or status changes as activity', () => {
    expect(
      messageUpsertIsProjectActivity(
        { content: 'hello', runStatus: 'running' },
        { content: 'hello world', runStatus: 'running' },
      ),
    ).toBe(true);
    expect(
      messageUpsertIsProjectActivity(
        { content: 'hello', runStatus: 'running' },
        { content: 'hello', runStatus: 'succeeded' },
      ),
    ).toBe(true);
  });

  it('ignores producedFiles-only fills (open HTML recovery)', () => {
    expect(
      messageUpsertIsProjectActivity(
        { content: 'hello', runStatus: 'succeeded', endedAt: 10, producedFiles: [] },
        {
          content: 'hello',
          runStatus: 'succeeded',
          endedAt: 10,
          producedFiles: [{ name: 'deck.html' }],
        },
      ),
    ).toBe(false);
  });

  it('ignores endedAt number/string aliases and success status synonyms', () => {
    expect(
      messageUpsertIsProjectActivity(
        { content: 'hello', runStatus: 'succeeded', endedAt: 1_700_000_000_000 },
        { content: 'hello', runStatus: 'completed', endedAt: '1700000000000' },
      ),
    ).toBe(false);
    expect(
      messageUpsertIsProjectActivity(
        { content: 'hello', runStatus: 'succeeded', endedAt: 10 },
        { content: 'hello', runStatus: 'success', endedAt: '1970-01-01T00:00:00.010Z' },
      ),
    ).toBe(false);
  });
});
