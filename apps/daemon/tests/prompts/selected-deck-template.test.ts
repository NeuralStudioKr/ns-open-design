import { describe, expect, it } from 'vitest';
import {
  preferSelectedDeckTemplateSkill,
  readSelectedDeckTemplateFromMetadata,
  wrapSelectedDeckTemplateSkillBody,
} from '../../src/prompts/selected-deck-template.js';

describe('selected-deck-template prompt helpers', () => {
  it('reads selected deck template metadata', () => {
    expect(readSelectedDeckTemplateFromMetadata(null)).toBeNull();
    expect(
      readSelectedDeckTemplateFromMetadata({
        selectedDeckTemplateId: ' html-ppt-hermes ',
        selectedDeckTemplateTitle: ' Hermes ',
      }),
    ).toEqual({ id: 'html-ppt-hermes', title: 'Hermes' });
  });

  it('wraps deck skill bodies with the selected-template guard', () => {
    const wrapped = wrapSelectedDeckTemplateSkillBody('body', 'Hermes');
    expect(wrapped).toContain('# Teamver selected deck template guard');
    expect(wrapped).toContain('Template: Hermes');
    expect(wrapped).toContain('body');
  });

  it('prefers selected template body and keeps scenario skill as secondary', () => {
    const preferred = preferSelectedDeckTemplateSkill({
      selected: { id: 'html-ppt-hermes', title: 'Hermes' },
      templateBody: '# Hermes visual rules\npalette: cyan',
      currentSkillBody: '# example-simple-deck scenario',
      currentSkillName: 'Simple Deck',
      secondarySkillBody: '# example-simple-deck scenario\ncompact deck rules',
      secondarySkillName: 'Simple Deck',
    });
    expect(preferred?.skillName).toBe('Hermes');
    expect(preferred?.skillBody).toContain('# Teamver selected deck template guard');
    expect(preferred?.skillBody).toContain('# Hermes visual rules');
    expect(preferred?.skillBody).toContain('## Composed skill — Simple Deck');
    expect(preferred?.skillBody).toContain('compact deck rules');
    // Template guard section comes before the secondary scenario block.
    expect(preferred?.skillBody.indexOf('Hermes visual rules')).toBeLessThan(
      preferred?.skillBody.indexOf('compact deck rules') ?? -1,
    );
  });

  it('falls back to a title stub when template body is missing', () => {
    const preferred = preferSelectedDeckTemplateSkill({
      selected: { id: 'html-ppt-hermes', title: 'Hermes' },
      templateBody: null,
      currentSkillBody: '# scenario',
    });
    expect(preferred?.skillBody).toContain('Template: Hermes');
    expect(preferred?.skillBody).toContain('Match this selected deck template');
  });
});
