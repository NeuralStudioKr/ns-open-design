import { describe, expect, it } from 'vitest';
import {
  enrichChatSendMetaWithProjectDeckTemplate,
  resolveDeckTemplateSkillId,
  resolveScenarioPluginIdForLocalSkill,
  wrapSelectedDeckTemplateSkillBody,
} from '../../src/runtime/selected-deck-template';

describe('selected-deck-template runtime helpers', () => {
  it('keeps the selected deck template first in skillIds without polluting pluginIds', () => {
    const enriched = enrichChatSendMetaWithProjectDeckTemplate(
      {
        skillIds: ['example-simple-deck', 'html-ppt-hermes'],
        context: {
          pluginIds: ['example-simple-deck', 'html-ppt-hermes'],
          skillIds: ['example-simple-deck'],
        },
      },
      {
        kind: 'deck',
        selectedDeckTemplateId: 'html-ppt-hermes',
        selectedDeckTemplateTitle: 'Hermes',
      },
    );

    expect(enriched?.skillIds).toEqual(['html-ppt-hermes', 'example-simple-deck']);
    expect(enriched?.context?.pluginIds).toEqual(['example-simple-deck']);
    expect(enriched?.context?.skillIds).toEqual(['html-ppt-hermes', 'example-simple-deck']);
  });

  it('prefers project metadata over scenario plugin ids for API-mode skill routing', () => {
    expect(
      resolveDeckTemplateSkillId(
        {
          kind: 'deck',
          selectedDeckTemplateId: 'html-ppt-hermes',
        },
        {
          skillIds: ['example-simple-deck'],
          context: { pluginIds: ['example-simple-deck'] },
        },
      ),
    ).toBe('html-ppt-hermes');
  });

  it('routes scenario plugin fallback separately from the selected visual template', () => {
    expect(
      resolveScenarioPluginIdForLocalSkill(
        {
          kind: 'deck',
          selectedDeckTemplateId: 'html-ppt-hermes',
        },
        {
          context: { pluginIds: ['html-ppt-hermes', 'example-simple-deck'] },
        },
        'example-simple-deck',
      ),
    ).toBe('example-simple-deck');
  });

  it('wraps deck skill bodies with the selected template guard', () => {
    const wrapped = wrapSelectedDeckTemplateSkillBody('body', 'Hermes');
    expect(wrapped).toContain('Template: Hermes');
    expect(wrapped).toContain('body');
  });
});
