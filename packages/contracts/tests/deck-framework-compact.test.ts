import { describe, expect, it } from 'vitest';

import {
  DECK_COMPACT_INLINE_LAYOUT_VOCABULARY,
  DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE,
  DECK_FRAMEWORK_DIRECTIVE_COMPACT,
  DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE,
  DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL,
} from '../src/prompts/deck-framework.js';

describe('DECK_FRAMEWORK_DIRECTIVE_COMPACT', () => {
  it('embeds inline layout vocabulary and forbids head-first output', () => {
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('API compact contract');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY);
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('Plugin inputs');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('use 6–8 slides only when none is specified');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('do not repeat the same padding/background/composition');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('Selected deck template look');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('secondary brand context only');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('do not** copy literally');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('Do not add `<head>`');
  });

  it('uses a three-slide wireframe so one-slide covers are not modeled as complete', () => {
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('three slides on purpose');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('slide-count top-up can append');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('justify-content:center');
    expect(
      DECK_FRAMEWORK_DIRECTIVE_COMPACT.match(/<section class="slide"/g)?.length,
    ).toBeGreaterThanOrEqual(3);
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

  it('selected-template compact contract omits Neutral sample colors', () => {
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'API compact contract with Selected deck template',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE,
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).not.toContain(
      'background:#0f172a;color:#f8fafc',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).not.toContain(
      'background:#1e293b;color:#fff',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'MUST come from the Selected deck template',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain('#0f172a');
  });

  it('selected-template compact contract forces visible slides before style-heavy kit chrome', () => {
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'the first 1200 characters after',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'first complete `<section class="slide">...</section>`',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'Do not open a `<head>` block',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'Complete deck beats perfect motif fidelity',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'Never start a slide with Motif `<svg>`',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'compact motif/deco cues',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'exempt from the ~800-char Motif-budget',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).not.toContain(
      'optional short style with kit @import',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'three slides on purpose',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'slide-count top-up can append',
    );
    expect(
      DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE.match(
        /<section class="slide"/g,
      )?.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('template-fill compact contract asks for 3 slides and defers Motif SVG', () => {
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).toContain(
      'produce **3** filled slides',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).toMatch(
      /Motif `<svg>` is NOT required this turn/i,
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).not.toContain(
      'persist rejects 1–2',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).not.toContain(
      'produce **5–6**',
    );
  });
});
