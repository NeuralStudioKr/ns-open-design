import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  preferSelectedDeckTemplateSkill,
  readSelectedDeckTemplateFromMetadata,
  wrapSelectedDeckTemplateSkillBody,
} from '../../src/prompts/selected-deck-template.js';

const serverSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/server.ts'),
  'utf8',
);

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
    // The title stub explicitly names the fallback so operators can grep for it
    // in prompt captures when a template body fails to load. Assert on that
    // stable header (the surrounding copy is intentionally free to iterate).
    expect(preferred?.skillBody).toContain('title-only fallback');
  });

  it('does not treat missing title as fatal when template body is present', () => {
    const preferred = preferSelectedDeckTemplateSkill({
      selected: { id: 'html-ppt-hermes' },
      templateBody: '# Hermes body',
      secondarySkillBody: '# scenario body',
      secondarySkillName: 'Simple Deck',
    });
    expect(preferred?.skillName).toBe('html-ppt-hermes');
    expect(preferred?.skillBody).toContain('# Hermes body');
    expect(preferred?.skillBody).toContain('## Composed skill — Simple Deck');
  });

  it('pins daemon compose to keep ad-hoc skill stack when template wins', () => {
    expect(serverSource).toContain(
      'const selectedDeckTemplate = readSelectedDeckTemplateFromMetadata(metadata);',
    );
    expect(serverSource).toContain('if (selectedDeckTemplate?.id) seen.add(selectedDeckTemplate.id);');
    expect(serverSource).toContain(
      'skillBody = preferred.skillBody + composedSkillBlocks;',
    );
    expect(serverSource).toContain('secondarySkillBody: scenarioSkillBody');
  });

  it('loads selected deck templates from skill-like/design-template roots before plugins', () => {
    const start = serverSource.indexOf('if (selectedDeckTemplate) {');
    expect(start).toBeGreaterThan(0);
    const block = serverSource.slice(start, start + 1600);
    expect(block).toContain('const allSkills = await loadAllSkills();');
    expect(block).toContain('findSkillById(allSkills, selectedDeckTemplate.id)');
    expect(block.indexOf('findSkillById(allSkills, selectedDeckTemplate.id)')).toBeLessThan(
      block.indexOf('getInstalledPlugin(db, selectedDeckTemplate.id)'),
    );
  });

  it('keeps ad-hoc composedSkillBlocks out of skillBody until final assembly', () => {
    const start = serverSource.indexOf('if (adHocSkillIds.length > 0) {');
    expect(start).toBeGreaterThan(0);
    const block = serverSource.slice(start, start + 3200);
    expect(block).toContain('composedSkillBlocks = blocks.join(\'\');');
    expect(block).toContain('skillBody = baseBody;');
    expect(block).not.toContain('skillBody = baseBody + composedSkillBlocks;');
  });

  it('keeps plugin-primary skillBody free of composedSkillBlocks until final assembly', () => {
    const start = serverSource.indexOf('// Keep ad-hoc blocks out of skillBody until final assembly');
    expect(start).toBeGreaterThan(0);
    const block = serverSource.slice(start, start + 400);
    expect(block).toContain('skillBody = local.body;');
    expect(block).not.toContain('skillBody = local.body + composedSkillBlocks;');
  });
});
