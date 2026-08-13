import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  extractTemplateVisualKitFromHtml,
  neutralizeFilesystemCloneWorkflow,
} from '../src/template-visual-kit.js';

const EXAMPLES_DIR = fileURLToPath(
  new URL('../../../plugins/_official/examples/', import.meta.url),
);

const SPRITE_MIN = 80;
const SPRITE_MAX = 2400;

type OfficialDeckExample = {
  folder: string;
  examplePath: string;
  skillPath: string | null;
};

async function listOfficialDeckExamples(): Promise<OfficialDeckExample[]> {
  const entries = await readdir(EXAMPLES_DIR, { withFileTypes: true });
  const out: OfficialDeckExample[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = entry.name;
    const manifestPath = path.join(EXAMPLES_DIR, folder, 'open-design.json');
    const examplePath = path.join(EXAMPLES_DIR, folder, 'example.html');
    const skillPath = path.join(EXAMPLES_DIR, folder, 'SKILL.md');
    let manifestRaw: string;
    try {
      manifestRaw = await readFile(manifestPath, 'utf8');
    } catch {
      continue;
    }
    if (!/"mode"\s*:\s*"deck"/i.test(manifestRaw)) continue;
    let html: string;
    try {
      html = await readFile(examplePath, 'utf8');
    } catch {
      continue;
    }
    // Skip iframe-only wrappers (no extractable visual system).
    if (/<iframe\b/i.test(html) && !/<style\b[^>]*>[\s\S]*:root/i.test(html)) {
      continue;
    }
    let skillOk = true;
    try {
      await readFile(skillPath, 'utf8');
    } catch {
      skillOk = false;
    }
    out.push({
      folder,
      examplePath,
      skillPath: skillOk ? skillPath : null,
    });
  }
  return out.sort((a, b) => a.folder.localeCompare(b.folder));
}

function countInRangeSvgs(html: string): number {
  return [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)]
    .map((match) => match[0] ?? '')
    .filter((svg) => svg.length >= SPRITE_MIN && svg.length <= SPRITE_MAX)
    .length;
}

describe('official deck template visual kits (all mode:deck example.html)', () => {
  it('extracts a usable token-safe kit for every official deck example.html', async () => {
    const files = await listOfficialDeckExamples();
    expect(files.length).toBeGreaterThan(40);

    const failures: string[] = [];
    for (const { folder, examplePath } of files) {
      const html = await readFile(examplePath, 'utf8');
      const kit = extractTemplateVisualKitFromHtml(html, { title: folder });
      if (!kit) {
        failures.push(`${folder}: kit null`);
        continue;
      }
      if (kit.length > 11_000) failures.push(`${folder}: kit ${kit.length} > 11000`);
      if (/…\s*$/.test(kit) && kit.length >= 11_000) {
        failures.push(`${folder}: truncated at budget`);
      }
      if (!kit.includes('### Slide surface')) {
        failures.push(`${folder}: missing Slide surface`);
      }
      if (!/TOKEN-SAFE CONTENT-SWAP/i.test(kit)) {
        failures.push(`${folder}: missing TOKEN-SAFE CONTENT-SWAP hard rule`);
      }
      if (/treat `example\.html` as the base deck/i.test(kit)) {
        failures.push(`${folder}: legacy TEMPLATE-AS-BASE dump language`);
      }
      const hasSlideShell =
        /<(?:section|div)\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/i.test(html)
        || /<section\b[^>]*\bclass\s*=\s*["'][^"']*\bs-[a-z0-9_-]+/i.test(html);
      if (hasSlideShell && !kit.includes('### Template scaffold map')) {
        failures.push(`${folder}: missing scaffold map despite slide shells`);
      }
      if (countInRangeSvgs(html) >= 1 && !kit.includes('### Motif sprites')) {
        failures.push(`${folder}: has in-range SVGs but no Motif sprites`);
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  }, 60_000);

  it('neutralizes Clone example.html for every official deck SKILL.md that has it', async () => {
    const files = await listOfficialDeckExamples();
    const stillCloning: string[] = [];
    for (const { folder, skillPath } of files) {
      if (!skillPath) continue;
      const skill = await readFile(skillPath, 'utf8');
      if (!/Clone\s+`?example\.html`?/i.test(skill)) continue;
      const neutralized = neutralizeFilesystemCloneWorkflow(skill);
      if (/\*\*Clone `example\.html`\*\*/i.test(neutralized)) {
        stillCloning.push(folder);
      }
      if (!/do not clone files/i.test(neutralized)) {
        stillCloning.push(`${folder}: missing API-mode rewrite`);
      }
    }
    expect(stillCloning, stillCloning.join('\n')).toEqual([]);
  }, 60_000);
});
