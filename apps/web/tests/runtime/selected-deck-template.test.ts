import { describe, expect, it } from 'vitest';
import {
  enrichChatSendMetaWithProjectDeckTemplate,
  formatSelectedDeckTemplateChipLabel,
  looksLikeDeckTemplateSkillId,
  resolveDeckTemplateSkillId,
  resolveSelectedDeckTemplateChipLabel,
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
    expect(enriched?.context?.selectedDeckTemplateId).toBe('html-ppt-hermes');
    expect(enriched?.context?.selectedDeckTemplateTitle).toBe('Hermes');
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

  it('copies selectedDeckTemplateId onto turn meta when enriching from project metadata', () => {
    const enriched = enrichChatSendMetaWithProjectDeckTemplate(
      { skillIds: ['example-simple-deck'] },
      {
        kind: 'deck',
        skipDiscoveryBrief: true,
        selectedDeckTemplateId: 'html-ppt-hermes',
        selectedDeckTemplateTitle: 'Hermes',
      },
    );
    expect(enriched?.selectedDeckTemplateId).toBe('html-ppt-hermes');
    expect(enriched?.selectedDeckTemplateTitle).toBe('Hermes');
    expect(enriched?.skipDiscoveryBrief).toBe(true);
    expect(enriched?.skillIds).toEqual(['html-ppt-hermes', 'example-simple-deck']);
  });

  it('uses per-turn selectedDeckTemplateId when project metadata is still stale', () => {
    expect(
      resolveDeckTemplateSkillId(
        { kind: 'deck' },
        {
          selectedDeckTemplateId: 'html-ppt-hermes',
          selectedDeckTemplateTitle: 'Hermes',
          skillIds: ['html-ppt-hermes'],
          context: { pluginIds: ['example-simple-deck'] },
        },
      ),
    ).toBe('html-ppt-hermes');

    const enriched = enrichChatSendMetaWithProjectDeckTemplate(
      {
        selectedDeckTemplateId: 'html-ppt-hermes',
        skillIds: ['example-simple-deck'],
        context: { pluginIds: ['example-simple-deck'] },
      },
      { kind: 'deck' },
    );
    expect(enriched?.skillIds).toEqual(['html-ppt-hermes', 'example-simple-deck']);
  });

  it('prefers per-turn template over a stale project template id', () => {
    expect(
      resolveDeckTemplateSkillId(
        {
          kind: 'deck',
          selectedDeckTemplateId: 'html-ppt-old',
          selectedDeckTemplateTitle: 'Old Template',
        },
        {
          selectedDeckTemplateId: 'html-ppt-hermes',
          selectedDeckTemplateTitle: 'Hermes',
          skillIds: ['html-ppt-hermes'],
        },
      ),
    ).toBe('html-ppt-hermes');

    const enriched = enrichChatSendMetaWithProjectDeckTemplate(
      {
        selectedDeckTemplateId: 'html-ppt-hermes',
        selectedDeckTemplateTitle: 'Hermes',
        skillIds: ['example-simple-deck'],
      },
      {
        kind: 'deck',
        selectedDeckTemplateId: 'html-ppt-old',
        selectedDeckTemplateTitle: 'Old Template',
      },
    );
    expect(enriched?.selectedDeckTemplateId).toBe('html-ppt-hermes');
    expect(enriched?.selectedDeckTemplateTitle).toBe('Hermes');
    expect(enriched?.skillIds).toEqual(['html-ppt-hermes', 'example-simple-deck']);
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
    expect(wrapped).toContain('Do not substitute drawn template motifs with emoji');
    expect(wrapped).toContain('Body-first output contract');
    expect(wrapped).toContain('<body><section class="slide"');
    expect(wrapped).toContain('Do not emit `<head>`');
    expect(wrapped).toContain('Content expansion');
    expect(wrapped).toMatch(/TOPIC to research/);
    expect(wrapped).toMatch(/echoes the prompt/);
  });

  it('does not invent pluginIds when enriching a send with no context', () => {
    const enriched = enrichChatSendMetaWithProjectDeckTemplate(undefined, {
      kind: 'deck',
      selectedDeckTemplateId: 'html-ppt-hermes',
      selectedDeckTemplateTitle: 'Hermes',
    });
    expect(enriched?.skillIds).toEqual(['html-ppt-hermes']);
    expect(enriched?.context?.pluginIds).toBeUndefined();
    expect(enriched?.context?.skillIds).toEqual(['html-ppt-hermes']);
    expect(enriched?.context?.selectedDeckTemplateId).toBe('html-ppt-hermes');
  });

  it('formats template chip labels from title or readable id fallback', () => {
    expect(
      formatSelectedDeckTemplateChipLabel({
        id: 'example-html-ppt-daisy',
        title: 'Daisy Days',
      }),
    ).toBe('Daisy Days');
    expect(
      formatSelectedDeckTemplateChipLabel({ id: 'example-html-ppt-daisy' }),
    ).toBe('html ppt daisy');
  });

  it('resolves chip label from message runContext before project metadata', () => {
    expect(
      resolveSelectedDeckTemplateChipLabel({
        projectMetadata: {
          kind: 'deck',
          selectedDeckTemplateId: 'html-ppt-old',
          selectedDeckTemplateTitle: 'Old',
        },
        runContext: {
          selectedDeckTemplateId: 'html-ppt-hermes',
          selectedDeckTemplateTitle: 'Hermes',
        },
      }),
    ).toBe('Hermes');
  });

  it('keeps a chip when project metadata has id but no title (re-entry)', () => {
    expect(
      resolveSelectedDeckTemplateChipLabel({
        projectMetadata: {
          kind: 'deck',
          selectedDeckTemplateId: 'example-html-ppt-zhangzara-daisy-days',
        },
      }),
    ).toBe('html ppt zhangzara daisy days');
  });

  it('classifies deck template skill ids separately from normal skills', () => {
    expect(looksLikeDeckTemplateSkillId('example-html-ppt-hermes')).toBe(true);
    expect(looksLikeDeckTemplateSkillId('html-ppt-hermes')).toBe(true);
    expect(looksLikeDeckTemplateSkillId('web-search')).toBe(false);
  });
});
