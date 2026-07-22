import { describe, expect, it } from 'vitest';

import {
  DECK_COMPACT_INLINE_LAYOUT_VOCABULARY,
  DECK_FRAMEWORK_DIRECTIVE_COMPACT,
} from '../src/prompts/deck-framework.js';

describe('DECK_FRAMEWORK_DIRECTIVE_COMPACT', () => {
  it('embeds inline layout vocabulary and forbids head-first output', () => {
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('API compact contract');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY);
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('6–8 slides');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('do not repeat the same padding/background');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('copy these two identical white slides literally');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('Do not add `<head>`');
  });

  it('names the core layout roles for API decks', () => {
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Cover**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Big stat**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Three-column**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Closing**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('never 4+ identical slides');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('1920×1080');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('72px/1.05');
  });
});
