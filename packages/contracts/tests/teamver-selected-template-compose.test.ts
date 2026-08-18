import { describe, expect, it } from 'vitest';

import { renderPluginBlock } from '../src/prompts/plugin-block.js';
import { composeSystemPrompt } from '../src/prompts/system.js';
import { readSkillFrontmatterDescription } from '../src/skill-frontmatter.js';
import {
  appendTemplateVisualKit,
  extractTemplateVisualKitFromHtml,
} from '../src/template-visual-kit.js';
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
  it('keeps Daisy Days visual kit and demotes Neutral Modern design system', async () => {
    const html = await (await import('node:fs/promises')).readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const loadedBody = appendTemplateVisualKit(
      withFrontmatterVisualSummary(CORAL_SKILL_MD.replace(/Coral/g, 'Daisy Days').replace(/coral/g, 'daisy-days')),
      extractTemplateVisualKitFromHtml(html, { title: 'Html Ppt Zhangzara Daisy Days' }),
    );
    const skillBody = wrapSelectedDeckTemplateSkillBody(
      loadedBody,
      'Html Ppt Zhangzara Daisy Days',
    );
    const prompt = composeSystemPrompt({
      skillBody,
      skillName: 'Html Ppt Zhangzara Daisy Days',
      skillMode: 'deck',
      designSystemBody: '# Neutral Modern\n\nUse dark forest greens and sparse covers.',
      designSystemTitle: 'Neutral Modern | Starter',
      metadata: {
        kind: 'deck',
        skipDiscoveryBrief: true,
        selectedDeckTemplateId: 'example-html-ppt-zhangzara-daisy-days',
        selectedDeckTemplateTitle: 'Html Ppt Zhangzara Daisy Days',
      },
      pluginBlock: renderPluginBlock(SIMPLE_DECK_SNAPSHOT, { role: 'scenario-only' }),
      streamFormat: 'plain',
      mediaExecution: { mode: 'disabled' },
      sessionMode: 'design',
    });

    expect(prompt).toContain('## Selected deck template — Html Ppt Zhangzara Daisy Days — MUST MATCH THIS VISUAL SPEC');
    expect(prompt).toContain('## Template visual kit (from example.html)');
    expect(prompt).toContain('#F5F0E6');
    expect(prompt).toContain('Fredoka One');
    expect(prompt).toContain('Motif sprites');
    expect(prompt).toMatch(/Do not invent emoji ornaments|Forbidden motif substitutes/i);
    expect(prompt).toContain('SECONDARY — brand context only');
    expect(prompt).toContain('Never turn a cheerful pastel / cream template into a dark Neutral Modern gradient');
    expect(prompt).toContain('Selected deck template visual — READ LAST');
    expect(prompt).toMatch(/brief is a topic, not slide text/i);
    expect(prompt).toContain('Expo for Senior Engineers');
    expect(prompt).toMatch(/Forbidden motif substitutes|emoji flowers\/stars|compact motif/i);
    expect(prompt).toMatch(/skip huge SVG\/style payloads/i);
    expect(prompt).toContain('Template visual kit (from example.html)');
    expect(prompt).toContain('**only** allowed palette');
    expect(prompt).toContain('API compact contract with Selected deck template');
    expect(prompt).not.toContain('**Mandatory:** bind these tokens into every slide');
    // Full Neutral Modern DESIGN.md must not ship — only the demotion stub.
    expect(prompt).not.toContain('Use dark forest greens and sparse covers.');
    expect(prompt).toContain('Full DESIGN.md omitted on purpose');
    // Compact Neutral wireframe samples must not appear after the kit
    // (models copy last concrete HTML and ignore Daisy Days tokens).
    expect(prompt).not.toContain('background:#0f172a;color:#f8fafc');
    expect(prompt).not.toContain('background:#1e293b;color:#fff');
    // Design-system demotion stub must precede the selected template kit.
    expect(prompt.indexOf('## Selected deck template')).toBeGreaterThan(
      prompt.indexOf('SECONDARY — brand context only'),
    );
    // READ LAST visual rule must be after compact contract.
    expect(prompt.indexOf('Selected deck template visual — READ LAST')).toBeGreaterThan(
      prompt.indexOf('API compact contract with Selected deck template'),
    );
    // Cue-extraction signature is redundant when the full kit is present.
    expect(prompt).not.toContain('Selected design template visual signature');
    // Teamver skip-discovery must not re-open Site-ref discovery.
    expect(prompt).not.toContain('Site-ref:');
    expect(prompt).toContain('width:1920px;height:1080px');
    // Attached-source styling must be explicitly ruled out — otherwise Canvas
    // → Slide runs copied the source Canvas's own gradient/font palette
    // (e.g. warm yellow-green Italy travel style) instead of Daisy Days.
    const readLastSection = prompt.slice(
      prompt.indexOf('Selected deck template visual — READ LAST'),
    );
    expect(readLastSection).toMatch(/attached\s+source|Canvas\s*\/\s*Drive/i);
    expect(readLastSection).toMatch(/source(?:'s)?\s+palette|source\s+HTML/i);
    expect(readLastSection).toMatch(/html.*body|KEEP verbatim/i);
    expect(readLastSection).toMatch(/preview-panel shell|paper-slides-on-wrong-shell|wrong preview-panel shell|dark app-shell/i);
    expect(prompt).toContain('### Slide surface');
    expect(prompt).toMatch(/\*\*background\*\*:\s*`#F5F0E6`/i);
    expect(prompt).toMatch(/\*\*color\*\*\s*\(text\):\s*`#2D2D2D`/i);
    // Fixed 1920×1080 canvas is non-negotiable — the compact contract and the
    // READ LAST section must both forbid viewport-relative sizing that the
    // template's example.html uses for its full-screen presenter mode.
    // Without this, the deck stretches and changes aspect ratio with the
    // browser (user report 2026-08-13 preview-panel).
    expect(readLastSection).toMatch(/Fixed 1920×1080/i);
    expect(readLastSection).toMatch(/100vw|100vh|scroll-snap/i);
    expect(readLastSection).toMatch(/preview panel|scaled preview|stretch/i);
    // Any Decoration/Layout CSS emitted must not tell the model to bind
    // viewport sizing — sanitizer strips 100vw/100vh from kit CSS blocks.
    const decoStart = prompt.indexOf('### Decorations CSS');
    if (decoStart >= 0) {
      const nextHeading = prompt.slice(decoStart + 3).search(/\n### /);
      const stop = nextHeading >= 0 ? decoStart + 3 + nextHeading : prompt.length;
      const decoBody = prompt.slice(decoStart, stop);
      expect(decoBody).not.toMatch(/100v[wh]/i);
      expect(decoBody).not.toMatch(/scroll-snap-(?:type|align|stop)/i);
    }
  });

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
      '# Selected visual template (title-only fallback)',
      '',
      'Template: Html Ppt Zhangzara Coral',
      'The Template visual kit could not be loaded this turn — still treat this selected template as the visual contract.',
      'Infer palette / typography / motif ONLY from this template title and any Visual summary cues in the prompt.',
      'Do NOT invent a Daisy Days cream/`#F5F0E6`/Fredoka look unless this template title/summary explicitly implies that identity.',
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
    // Kit-miss path: do NOT claim a missing kit is the only palette; use the
    // softened READ LAST so Neutral slate is still discouraged.
    expect(prompt).not.toContain('**only** allowed palette');
    expect(prompt).toContain('Template visual kit may be incomplete');
    expect(prompt).toContain('Visual summary / title / prose cues');
    expect(prompt).toContain('Do **not** invent a sparse Neutral Modern slate cover');
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
