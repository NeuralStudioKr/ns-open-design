import { describe, expect, it } from 'vitest';

import { renderPluginBlock } from '../src/prompts/plugin-block.js';
import { composeSystemPrompt } from '../src/prompts/system.js';
import { readSkillFrontmatterDescription } from '../src/skill-frontmatter.js';
import type { AppliedPluginSnapshot } from '../src/plugins/apply.js';

/**
 * End-to-end regression for Canvas → Slide template apply (BYOK).
 * Assembles the prompt the way Teamver slide-only API compose must after the
 * FE loads a Zhangzara-style plugin-local SKILL.md — and asserts the default
 * Simple Deck scenario cannot steal visual ownership.
 */
function wrapSelectedDeckTemplateSkillBody(skillBody: string, templateTitle: string): string {
  return [
    '# Teamver selected deck template guard',
    '',
    `Template: ${templateTitle}`,
    '',
    'The user explicitly picked this template in the Canvas → Slide launch step.',
    '--- Template specification follows ---',
    '',
    skillBody.trim(),
  ].join('\n');
}

function withFrontmatterVisualSummary(rawSkillMd: string): string {
  const closeIdx = rawSkillMd.indexOf('\n---', 3);
  const bodyOnly = closeIdx === -1
    ? rawSkillMd
    : rawSkillMd.slice(closeIdx + 4).replace(/^\r?\n/, '');
  const description = readSkillFrontmatterDescription(rawSkillMd);
  if (!description || bodyOnly.includes(description)) return bodyOnly.trim();
  return `## Visual summary (from template frontmatter)\n\n${description}\n\n${bodyOnly.trim()}`;
}

const CORAL_SKILL_MD = [
  '---',
  'name: html-ppt-zhangzara-coral',
  'description: |',
  '  Coral — Cream and coral on near-black, set in oversized Bebas Neue.',
  '  Warm-graphic editorial deck for fashion / beauty / F&B.',
  '---',
  '',
  '# Coral',
  '',
  '1. Copy from the matching template folder.',
  '2. Do not invent a new palette.',
].join('\n');

const SIMPLE_DECK_SNAPSHOT = {
  snapshotId: 'snap-simple-deck',
  pluginId: 'example-simple-deck',
  pluginVersion: '0.1.1',
  pluginTitle: 'Simple Deck',
  pluginDescription:
    'Single-file horizontal-swipe HTML deck. Built by copying the seed assets/template.html.',
  query: 'Make a simple pitch deck',
  inputs: {
    topic: 'Q3 business review',
    slideCount: '8',
    visualTemplate: 'Html Ppt Zhangzara Coral',
  },
  resolvedContext: { items: [], atoms: ['file-write'] },
  capabilitiesGranted: [],
  capabilitiesRequired: [],
  assetsStaged: [],
  taskKind: 'new-generation',
  appliedAt: 0,
  connectorsRequired: [],
  connectorsResolved: [],
  mcpServers: [],
  manifestSourceDigest: 'test',
  status: 'fresh',
} as AppliedPluginSnapshot;

describe('Teamver selected deck template compose (BYOK slide-only)', () => {
  it('keeps Coral / Bebas visual contract and demotes Simple Deck plugin ownership', () => {
    const loadedBody = withFrontmatterVisualSummary(CORAL_SKILL_MD);
    const skillBody = wrapSelectedDeckTemplateSkillBody(
      loadedBody,
      'Html Ppt Zhangzara Coral',
    );
    // Must NOT append simple-deck scenario body (FE omitSecondary path).
    expect(skillBody).not.toContain('assets/template.html');

    const pluginBlock = renderPluginBlock(SIMPLE_DECK_SNAPSHOT, { role: 'scenario-only' });
    const prompt = composeSystemPrompt({
      skillBody,
      skillName: 'Html Ppt Zhangzara Coral',
      skillMode: 'deck',
      metadata: {
        kind: 'deck',
        skipDiscoveryBrief: true,
        selectedDeckTemplateId: 'example-html-ppt-zhangzara-coral',
        selectedDeckTemplateTitle: 'Html Ppt Zhangzara Coral',
      },
      pluginBlock,
      streamFormat: 'plain',
      mediaExecution: { mode: 'disabled' },
      sessionMode: 'design',
    });

    expect(prompt).toContain('## Selected deck template — Html Ppt Zhangzara Coral — MUST MATCH THIS VISUAL SPEC');
    expect(prompt).toContain('## Visual summary (from template frontmatter)');
    expect(prompt).toContain('Cream and coral on near-black');
    expect(prompt).toContain('Bebas Neue');
    expect(prompt).toContain('## Active scenario plugin (structure only)');
    expect(prompt).toContain('Do NOT use this scenario plugin');
    expect(prompt).not.toContain('The user applied plugin **Simple Deck**');
    // Simple Deck seed workflow must not appear as the selected visual body.
    const selectedIdx = prompt.indexOf('## Selected deck template — Html Ppt Zhangzara Coral');
    const afterSelected = prompt.slice(selectedIdx, selectedIdx + 2500);
    expect(afterSelected).not.toContain('assets/template.html');
    expect(afterSelected).not.toContain('references/layouts.md');
  });

  it('does not treat a title-stub fallback as Simple Deck seed workflow', () => {
    // When plugin-local load fails, FE must use a title stub — never wrap
    // example-simple-deck and call it the selected template.
    const stub = [
      '# Selected visual template',
      '',
      'Template: Html Ppt Zhangzara Coral',
      'Match this selected deck template\'s visible style as closely as possible.',
      'Do not fall back to the default simple-deck / scenario look.',
    ].join('\n');
    const skillBody = wrapSelectedDeckTemplateSkillBody(stub, 'Html Ppt Zhangzara Coral');
    const prompt = composeSystemPrompt({
      skillBody,
      skillName: 'Html Ppt Zhangzara Coral',
      skillMode: 'deck',
      metadata: {
        kind: 'deck',
        skipDiscoveryBrief: true,
        selectedDeckTemplateId: 'example-html-ppt-zhangzara-coral',
      },
      pluginBlock: renderPluginBlock(SIMPLE_DECK_SNAPSHOT, { role: 'scenario-only' }),
      streamFormat: 'plain',
      mediaExecution: { mode: 'disabled' },
      sessionMode: 'design',
    });
    expect(prompt).toContain('Do not fall back to the default simple-deck');
    expect(prompt).not.toContain('copying the seed assets/template.html');
  });

  it('parses real Zhangzara coral SKILL.md block-literal description', async () => {
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-coral/SKILL.md',
        import.meta.url,
      ),
      'utf8',
    );
    const description = readSkillFrontmatterDescription(raw);
    expect(description).toBeTruthy();
    expect(description).toContain('Coral');
    expect(description).toContain('Bebas Neue');
    expect(description).not.toBe('|');
  });
});
