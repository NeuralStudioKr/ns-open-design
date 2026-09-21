import { describe, expect, it } from 'vitest';

import {
  SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION,
  renderSlideCountRequirementInstruction,
  renderSlideCountSeedHeaderHint,
} from '../src/prompts/deck-quality.js';

describe('루프550 renderSlideCountRequirementInstruction', () => {
  it('pins Return EXACTLY N and Seed contains N', () => {
    const text = renderSlideCountRequirementInstruction(10);
    expect(text).toContain('Return EXACTLY 10');
    expect(text).toContain('Seed contains 10');
    expect(text).toContain('copy missing slides verbatim from the seed');
  });

  it('falls back to the keep-slide-count constant when N is unknown', () => {
    expect(renderSlideCountRequirementInstruction(null)).toBe(
      SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION,
    );
    expect(renderSlideCountRequirementInstruction(0)).toBe(
      SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION,
    );
  });

  it('emits the seed header with the same N pins', () => {
    const header = renderSlideCountSeedHeaderHint(10);
    expect(header).toContain('Seed contains 10');
    expect(header).toContain('Return EXACTLY 10');
    expect(renderSlideCountSeedHeaderHint(null)).toBeNull();
  });
});
