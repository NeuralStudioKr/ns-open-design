import { describe, expect, it } from 'vitest';

/**
 * Live MiniMax browser generation is gated on a managed key.
 * This environment does not provide MINIMAX_API_KEY. Do not invent a
 * generation round-trip here. When a key is injected in CI, a separate
 * live suite should run; this file only records the skip contract.
 */
const MINIMAX_KEY = String(process.env.MINIMAX_API_KEY ?? '').trim();

describe('MiniMax live browser E2E gate', () => {
  it.skipIf(!MINIMAX_KEY)(
    'key is present — live browser suite is owned elsewhere, not this unit file',
    () => {
      expect(MINIMAX_KEY.length).toBeGreaterThan(0);
    },
  );

  it('records that managed MiniMax key is absent (no live generation)', () => {
    if (MINIMAX_KEY) return;
    expect(MINIMAX_KEY).toBe('');
    expect(String(process.env.MINIMAX_API_KEY ?? '')).toBe('');
  });
});
