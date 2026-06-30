import { describe, expect, it } from 'vitest';

import { buildDeckPrintCss } from '../src/headless-export.js';

describe('buildDeckPrintCss', () => {
  it('overrides inactive slides so every deck-framework slide prints', () => {
    const css = buildDeckPrintCss();
    expect(css).toContain('.slide:not(.active)');
    expect(css).toContain('display: flex !important');
    expect(css).toContain('.deck-stage');
    expect(css).toContain('height: auto !important');
    expect(css).toContain('.deck-shell');
    expect(css).toContain('position: static !important');
    expect(css).toContain('page-break-after: always !important');
  });

  it('exports revealAllDeckSlides for runtime flattening', async () => {
    const mod = await import('../src/headless-export.js');
    expect(typeof mod.revealAllDeckSlides).toBe('function');
  });
});
