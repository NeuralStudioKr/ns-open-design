// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  sessionStorage.clear();
  vi.resetModules();
});

describe('revision-active-sequence', () => {
  it('writes and clears sessionStorage with the active sequence', async () => {
    const mod = await import('../../src/runtime/revision-active-sequence');
    mod.setActiveRevisionSequence('project-1', 'deck.html', 2);
    expect(sessionStorage.getItem('od:revision-active-seq:project-1::deck.html')).toBe('2');
    mod.clearActiveRevisionSequence('project-1', 'deck.html');
    expect(sessionStorage.getItem('od:revision-active-seq:project-1::deck.html')).toBeNull();
  });

  it('restores active sequence from sessionStorage on a fresh module load', async () => {
    const mod = await import('../../src/runtime/revision-active-sequence');
    mod.setActiveRevisionSequence('project-1', 'deck.html', 7);
    vi.resetModules();
    const fresh = await import('../../src/runtime/revision-active-sequence');
    expect(fresh.getActiveRevisionSequence('project-1', 'deck.html')).toBe(7);
    fresh.clearActiveRevisionSequence('project-1', 'deck.html');
  });
});
