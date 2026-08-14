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
    expect(wrapped).toContain('Content quality bar');
    expect(wrapped).toContain('headline, takeaway');
    expect(wrapped).toContain('keep HTML compact');
    expect(wrapped).toContain('Content expansion');
    expect(wrapped).toMatch(/TOPIC to research/);
    expect(wrapped).toMatch(/echoes the prompt/);
    expect(wrapped).toContain('Body-first output contract');
    expect(wrapped).toContain('<body><section class="slide"');
    expect(wrapped).toContain('Do not emit `<head>`');
    expect(wrapped).toContain('skip huge SVG `<style>` payloads');
    expect(wrapped).toContain('skip Motif `<svg>` entirely');
  });

  it('prefers selected template body and does not append Simple Deck as secondary', () => {
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
    // Secondary Simple Deck body historically reclaimed visuals over the
    // selected template — structure lives in compact deck rules instead.
    expect(preferred?.skillBody).not.toContain('## Composed skill — Simple Deck');
    expect(preferred?.skillBody).not.toContain('compact deck rules');
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
    expect(preferred?.skillBody).not.toContain('## Composed skill — Simple Deck');
  });

  it('pins daemon compose to keep ad-hoc skill stack when template wins', () => {
    expect(serverSource).toContain(
      'selectedDeckTemplateFromRun ?? readSelectedDeckTemplateFromMetadata(metadata);',
    );
    expect(serverSource).toContain('if (selectedDeckTemplate?.id) seen.add(selectedDeckTemplate.id);');
    expect(serverSource).toContain(
      'skillBody = preferred.skillBody + composedSkillBlocks;',
    );
    expect(serverSource).toContain('secondarySkillBody: scenarioSkillBody');
    expect(serverSource).toContain('omitDesignSystemForSelectedTemplate');
    expect(serverSource).toContain(
      'if (effectiveDesignSystemId && !omitDesignSystemForSelectedTemplate)',
    );
  });

  it('resolves project metadata through the Postgres async fallback so cold nodes see selectedDeckTemplateId', () => {
    // Cache-only getProject on Postgres nodes silently dropped the selected
    // deck template when the run landed on a different pod than the create
    // (metadata invisible → template body never loaded → Canvas → Slide
    // came back looking like the default deck). Compose must await
    // getProjectAsync so a cold-node lookup hits Postgres and re-warms the
    // local cache.
    const start = serverSource.indexOf('const composeDaemonSystemPrompt = async ({');
    expect(start).toBeGreaterThan(0);
    // Window sized to cover the safety try/catch wrapper around getProjectAsync
    // without also swallowing the giant metadata / selectedDeckTemplate block.
    const block = serverSource.slice(start, start + 2400);
    expect(block).toContain('await getProjectAsync(db, projectId)');
    // Sync fallback stays as belt-and-suspenders inside the catch (Postgres
    // pool degraded mid-run must not silently drop the template metadata
    // too), so we tolerate the sync call inside `catch`. What matters is
    // that the async path runs first.
    expect(block.indexOf('await getProjectAsync(db, projectId)')).toBeLessThan(
      block.indexOf('getProject(db, projectId)'),
    );
  });

  it('accepts run-scoped selectedDeckTemplateId so metadata patch races cannot drop the picked template', () => {
    const composeStart = serverSource.indexOf('const composeDaemonSystemPrompt = async ({');
    expect(composeStart).toBeGreaterThan(0);
    const composeBlock = serverSource.slice(composeStart, composeStart + 5600);
    expect(composeBlock).toContain('selectedDeckTemplateId,');
    expect(composeBlock).toContain('selectedDeckTemplateTitle,');
    expect(composeBlock).toContain('const selectedDeckTemplateFromRun');
    expect(composeBlock).toMatch(
      /selectedDeckTemplate\s*=\s*selectedDeckTemplateFromRun\s*\?\?\s*readSelectedDeckTemplateFromMetadata\(metadata\)/,
    );

    const callStart = serverSource.indexOf('await composeDaemonSystemPrompt({');
    expect(callStart).toBeGreaterThan(0);
    const callBlock = serverSource.slice(callStart, callStart + 900);
    expect(callBlock).toContain('selectedDeckTemplateId,');
    expect(callBlock).toContain('selectedDeckTemplateTitle,');
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
