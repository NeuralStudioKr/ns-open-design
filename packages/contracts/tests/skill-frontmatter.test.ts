import { describe, expect, it } from 'vitest';

import { readSkillFrontmatterDescription } from '../src/skill-frontmatter.js';

describe('readSkillFrontmatterDescription', () => {
  it('reads a single-line description', () => {
    const raw = [
      '---',
      'name: hermes',
      'description: Dark terminal #0a0c10 with mint #7ed3a4.',
      '---',
      '',
      '# Body',
    ].join('\n');
    expect(readSkillFrontmatterDescription(raw)).toBe(
      'Dark terminal #0a0c10 with mint #7ed3a4.',
    );
  });

  it('reads YAML block-literal descriptions used by Zhangzara templates', () => {
    // Regression: the previous one-line regex matched the bare `|`
    // indicator. That truthy "|" blocked manifest fallbacks and made
    // `body.includes("|")` skip the Visual summary prepend — so Canvas →
    // Slide kept falling back to the default simple-deck look.
    const raw = [
      '---',
      'name: html-ppt-zhangzara-coral',
      'description: |',
      '  Coral — Cream and coral on near-black, set in oversized Bebas Neue.',
      '  Anything that should feel warm-graphic and editorial.',
      'triggers:',
      '  - coral',
      '---',
      '',
      '# Coral',
      '',
      '> Cream and coral on near-black.',
    ].join('\n');
    expect(readSkillFrontmatterDescription(raw)).toBe(
      [
        'Coral — Cream and coral on near-black, set in oversized Bebas Neue.',
        'Anything that should feel warm-graphic and editorial.',
      ].join('\n'),
    );
  });

  it('returns null for a bare block indicator so callers can fall back to manifest.description', () => {
    const raw = [
      '---',
      'name: broken',
      'description: |',
      '---',
      '',
      '# Body with | pipes everywhere',
    ].join('\n');
    expect(readSkillFrontmatterDescription(raw)).toBeNull();
  });
});
