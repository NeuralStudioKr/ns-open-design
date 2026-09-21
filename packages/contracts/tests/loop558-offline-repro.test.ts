import { describe, expect, it } from 'vitest';

import { runLoop558OfflineRepro } from './helpers/loop558-offline-repro.js';

describe('0918-N04 loop558 offline LOOK seed repro', () => {
  it('writes live fixtures and pins leftover-free seed-length decks', () => {
    const rows = runLoop558OfflineRepro();
    expect(rows.length).toBe(10);
    for (const row of rows) {
      expect(row.leftover, row.kit).toEqual([]);
      expect(row.slides, row.kit).toBe(row.previewSlides);
      expect(row.hangulOk, row.kit).toBe(true);
    }
    expect(rows.find((row) => row.kit === 'grove-pad')?.pad).toBeGreaterThan(0);
    expect(rows.find((row) => row.kit === 'studio-pad')?.pad).toBeGreaterThan(0);
    expect(rows.find((row) => row.kit === 'block-frame-pad')?.pad).toBeGreaterThan(0);
  });
});
