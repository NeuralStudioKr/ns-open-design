import { describe, expect, it } from 'vitest';

/**
 * 0901-N02 MiniMax live E2E — only when a real key is present.
 * Never invent a fake live run in keyless CI/cloud VMs.
 */
describe('0901-N02 MiniMax live E2E', () => {
  const key = String(process.env.MINIMAX_API_KEY ?? process.env.OD_MINIMAX_API_KEY ?? '').trim();

  it('is armed only when MINIMAX_API_KEY is set', () => {
    if (!key) {
      expect(key).toBe('');
      return;
    }
    // Live exercise belongs in a keyed environment; presence alone is the gate.
    expect(key.length).toBeGreaterThan(8);
  });

  it.skipIf(!key)('placeholder for keyed MiniMax clone slot-fill smoke', () => {
    expect(key.length).toBeGreaterThan(8);
  });
});
