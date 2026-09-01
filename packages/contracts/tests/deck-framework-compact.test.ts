import { describe, expect, it } from 'vitest';

import {
  COMPACT_FIRST_FILL_HONOR_MAX,
  COMPACT_FIRST_FILL_SLIDE_COUNT_GUIDANCE,
  COMPACT_FIRST_FILL_SLIDE_COUNT_THIS_TURN,
  COMPACT_FIRST_FILL_TOP_UP_FROM,
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
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('Module 3');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('PILLAR 10');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('임시/fake');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('C/3번/(3)');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('D/첫째/셋째');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('E/여섯째');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('G/열한째');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('H/열두째');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('J/열세째');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('K/열네째');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('L/열다섯째');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('M/열여섯째');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('N/열일곱째');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('O/열여덟째');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('P/열아홉째');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('P/열아홉째/Q');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('Q/스무째');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('Q/스무째/R');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('스무째/R');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('스무째/R/S');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('R/S');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('R/S/T');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('S/T');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('S/T/U');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('T/U');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('T/U/W');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('U/W');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('xxx');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('Group 3');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('xxx/null');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('null/pass');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('pass/foo');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('Chapter 3');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('foo/FIXME');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('FIXME/etc');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('etc/ok');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('ok/misc');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('misc/other');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('33vh/vmin');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('33vh/vmin/dvw');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('33vh/vmin/dvw/cqmin');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('33vh/vmin/dvw/cqmin/dvmin');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('33vh/vmin/dvw/cqmin/dvmin/vi');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('0.33fr');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('Lesson 3');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('Class flex rows');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('no px/%/vw width or min-width');
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY).toContain('vh/vmin');
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
      'C/3번',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'D/첫째',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'E/여섯째',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'G/열한째',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'H/열두째',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'J/열세째',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'K/열네째',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'L/열다섯째',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'M/열여섯째',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'N/열일곱째',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'O/열여덟째',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'P/열아홉째/Q',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'Q/스무째',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'Q/스무째/R',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'R/S',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'S/T',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'T/U',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'U/W',
    );
    expect(DECK_COMPACT_INLINE_LAYOUT_VOCABULARY_FOR_SELECTED_TEMPLATE).toContain(
      'vh/vmin',
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
      'first 1200 chars after',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'one complete `<section class="slide">...</section>`',
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE).toContain(
      'No `<head>`/long chrome dump',
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

  it('honors explicit 1–10 this turn, keeps unspecified at 6, and tops up only 11+', () => {
    expect(COMPACT_FIRST_FILL_SLIDE_COUNT_THIS_TURN).toBe(6);
    expect(COMPACT_FIRST_FILL_HONOR_MAX).toBe(10);
    expect(COMPACT_FIRST_FILL_TOP_UP_FROM).toBe(11);
    expect(COMPACT_FIRST_FILL_SLIDE_COUNT_GUIDANCE).toMatch(
      /honor an explicit user count of 1–10/i,
    );
    expect(COMPACT_FIRST_FILL_SLIDE_COUNT_GUIDANCE).toContain('8-10 → close this turn');
    expect(COMPACT_FIRST_FILL_SLIDE_COUNT_GUIDANCE).toContain(
      'If the user asked for 11 or more, close 6 complete body-first slides this turn',
    );
    expect(COMPACT_FIRST_FILL_SLIDE_COUNT_GUIDANCE).toContain('If unspecified, close 6 this turn');
    expect(COMPACT_FIRST_FILL_SLIDE_COUNT_GUIDANCE).not.toMatch(
      /honor an explicit user count of 1–6/i,
    );
    expect(COMPACT_FIRST_FILL_SLIDE_COUNT_GUIDANCE).not.toContain('7 or more');
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).toContain(
      COMPACT_FIRST_FILL_SLIDE_COUNT_GUIDANCE,
    );
  });

  it('template-fill compact contract asks for up to 6 slides this turn and requires visible Motif anchors', () => {
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).toMatch(
      /honor an explicit user count of 1–10/i,
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
      /Render 1–2 compact visible kit Motif\/deco anchors/i,
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).toMatch(
      /REQUIRE 1–2 visible kit Motif CSS\/HTML\/deco anchors/i,
    );
    expect(DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL).not.toMatch(
      /official Motif is merged after save|Motif `<svg>` is NOT required this turn/i,
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
