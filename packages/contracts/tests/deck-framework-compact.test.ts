import { describe, expect, it } from 'vitest';

import {
  DECK_COMPACT_INLINE_LAYOUT_VOCABULARY,
  DECK_FRAMEWORK_DIRECTIVE_COMPACT,
} from '../src/prompts/deck-framework.js';

describe('DECK_FRAMEWORK_DIRECTIVE_COMPACT', () => {
  it('embeds inline layout vocabulary and forbids head-first output', () => {
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('API compact contract');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY);
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('Plugin inputs');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('use 6–8 slides only when none is specified');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('do not repeat the same padding/background/composition');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('template/design-system feel');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('copy these two identical white slides literally');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('Do not add `<head>`');
  });

  it('names the core layout roles for API decks', () => {
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Cover**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Big stat**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Three-column**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Split thesis**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Timeline / pipeline**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Quote / principle**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Closing**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('never 3+ identical slides');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('designed presentation');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('1920×1080');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('72px/1.05');
  });
});
