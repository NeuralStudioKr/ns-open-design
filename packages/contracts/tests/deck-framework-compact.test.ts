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
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain(
      'Never emit the same heading, paragraph, or badge twice in a row',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'Never emit the same heading, paragraph, or badge twice in a row',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).toContain(
      'adjacent duplicate headings/paragraphs/badges',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('Selected deck template look');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('secondary brand context only');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('do not** copy literally');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('Do not add `<head>`');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('Title-only sections');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain('Title-only sections');
  });

  it('uses a three-slide wireframe as a minimum shape, not the deliverable', () => {
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('minimum shape');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('Stopping after 3 slides is a failure');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('close 6 THIS TURN');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).not.toContain('three slides on purpose');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).not.toContain('slide-count top-up can append');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('justify-content:center');
    expect(
      DECK_FRAMEWORK_DIRECTIVE_COMPACT.match(/<section class="slide"/g)?.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('names the core layout roles for API decks', () => {
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Cover**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Big stat**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Three-column**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('Column count = card count');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('minmax(0,1fr)');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('empty card shell');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('placeholder card shell');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('TBD/N/A/n.a./준비중');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('empty/blank');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('작성예정');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('dummy/예시');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('PILLAR 03');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('해당없음');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('PILLAR III');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('No. 3');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('KEY 3');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('③');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('Phase 3');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('tobefilled');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('soon/later/대기');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('PILLAR 00');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('０');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('lorem ipsum');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('자료없음');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('Class flex rows');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('no px/%/vw width or min-width');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('max-width');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('flex: 0 0');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('Never wrap a card in another card');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'Column count = card count',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'empty/placeholder card shell',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'PILLAR 03',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'no px/%/vw width or min-width',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'max-width',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'flex: 0 0',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'Never wrap a card in another card',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Split thesis**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Timeline / pipeline**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Quote / principle**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('**Closing**');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('never 3+ identical slides');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('designed presentation');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('1920×1080');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('72px/1.05');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('width:1920px;height:1080px');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('never omit `class="slide"`');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('one idea only');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('no stat column');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).toContain('data-screen-label="01 Cover"');
    const unlabeledNeutralHosts = [
      ...DECK_COMPACT_INLINE_LAYOUT_VOCABULARY.matchAll(
        /<section class="slide"(?![^>]*data-screen-label=)/g,
      ),
    ];
    expect(unlabeledNeutralHosts).toHaveLength(0);
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('data-screen-label="02 Body"');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('data-screen-label="03 Stat"');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('data-screen-label="05 Close"');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain('one idea only');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('at most 3 next steps');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'Kit cards, not fake frames',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'position:absolute',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('overlay index badges');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'overlay index badges',
    );
    // Samples must not teach viewport sizing (ban prose may still name 100vh).
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).not.toMatch(
      /style="[^"]*min-height:100vh/,
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).not.toMatch(
      /style="[^"]*\b100vw\b/,
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).not.toMatch(
      /style="[^"]*overflow:hidden/,
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT).not.toMatch(
      /style="[^"]*overflow:hidden/,
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).not.toMatch(
      /style="[^"]*overflow:hidden/,
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).not.toMatch(
      /style="[^"]*overflow:hidden/,
    );
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
      'minimum shape',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'Stopping after 3 slides is a failure',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).not.toContain(
      'three slides on purpose',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).not.toContain(
      'slide-count top-up can append',
    );
    expect(
      DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE.match(
        /<section class="slide"/g,
      )?.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('template-fill compact contract asks for up to 6 slides this turn and defers Motif SVG', () => {
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).toMatch(
      /honor an explicit user count of 1–6/i,
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).toContain(
      'no 3+3+3 split',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).toContain(
      '5-6/5~6 → close ≥5 this turn',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).toContain(
      'when the target is 5+',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).not.toContain(
      'produce **3** filled slides',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).toMatch(
      /Motif `<svg>` is NOT required this turn/i,
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).toMatch(
      /REQUIRE 1–2 kit Motif CSS\/deco classes/i,
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).not.toMatch(
      /Optional tiny kit Motif CSS/i,
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).not.toContain(
      'persist rejects 1–2',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).not.toContain(
      'produce **5–6**',
    );
  });
});
