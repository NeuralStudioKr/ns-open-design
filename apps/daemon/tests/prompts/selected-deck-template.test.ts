import { describe, expect, it } from 'vitest';
import {
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
});
