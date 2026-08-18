import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  extractMotifVocabularyClasses,
  extractTemplateVisualKitFromHtml,
  neutralizeFilesystemCloneWorkflow,
  slimTemplateVisualKitForFill,
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
      if (kit.length > 14_000) failures.push(`${folder}: kit ${kit.length} > 14000`);
      if (/…\s*$/.test(kit) && kit.length >= 14_000) {
        failures.push(`${folder}: truncated at budget`);
      }
      if (!kit.includes('### Slide surface')) {
        failures.push(`${folder}: missing Slide surface`);
      }
      if (!kit.includes('### Must-match look')) {
        failures.push(`${folder}: missing Must-match look checklist`);
      }
      if (!/LOOK LIKE THE TEMPLATE|TOKEN-SAFE CONTENT-SWAP/i.test(kit)) {
        failures.push(`${folder}: missing look-match hard rule`);
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

  it('neutralizes Clone example.html / copy index.html for every official deck SKILL.md that has it', async () => {
    const files = await listOfficialDeckExamples();
    const stillCloning: string[] = [];
    for (const { folder, skillPath } of files) {
      if (!skillPath) continue;
      const skill = await readFile(skillPath, 'utf8');
      const hasFsClone = /Clone\s+`?example\.html`?|copy\s+`?index\.html`?|Start from the matching template folder|skills\/html-ppt\/templates\//i.test(skill);
      if (!hasFsClone) continue;
      const neutralized = neutralizeFilesystemCloneWorkflow(skill);
      if (/\*\*Clone `example\.html`\*\*/i.test(neutralized)) {
        stillCloning.push(folder);
      }
      if (/copy\s+`index\.html`/i.test(neutralized) || /Start from the matching template folder/i.test(neutralized)) {
        stillCloning.push(`${folder}: copy index.html / matching-folder survived`);
      }
      if (/skills\/html-ppt\/templates\//i.test(neutralized)) {
        stillCloning.push(`${folder}: html-ppt template path survived`);
      }
      if (!/do not clone files/i.test(neutralized)) {
        stillCloning.push(`${folder}: missing API-mode rewrite`);
      }
    }
    expect(stillCloning, stillCloning.join('\n')).toEqual([]);
  }, 60_000);

  it('binds .tpl-* identity surface instead of shared html-ppt white :root', async () => {
    const files = await listOfficialDeckExamples();
    const failures: string[] = [];
    for (const { folder, examplePath } of files) {
      const html = await readFile(examplePath, 'utf8');
      if (!/\.tpl-[a-z0-9_-]+\s*\{/.test(html)) continue;
      const kit = extractTemplateVisualKitFromHtml(html, { title: folder });
      if (!kit) {
        failures.push(`${folder}: kit null`);
        continue;
      }
      if (!/Identity host class: `\.(tpl-[a-z0-9_-]+)`/.test(kit)) {
        failures.push(`${folder}: missing Identity host class`);
      }
      const hasSharedWhiteRoot = /--bg\s*:\s*#ffffff/i.test(html);
      const identitySlide = /\.tpl-[a-z0-9_-]+\s+\.slide\s*\{[^}]*background(?:-color)?\s*:[^}]+\}/i.exec(html);
      const bgDecl = identitySlide
        ? /background(?:-color)?\s*:\s*([^;]+)/i.exec(identitySlide[0])?.[1] ?? ''
        : '';
      const identityIsSharedWhite = !bgDecl
        || /#fff(?:fff)?\b/i.test(bgDecl)
        || /var\(\s*--bg\s*\)/i.test(bgDecl);
      if (hasSharedWhiteRoot && bgDecl && !identityIsSharedWhite) {
        const surface = kit.match(/### Slide surface \(bind[\s\S]{0,700}/)?.[0] ?? '';
        if (/\*\*background\*\*: `#ffffff` \(from `--(?:bg|surface)`\)/.test(surface)) {
          failures.push(`${folder}: shared --bg white won over identity slide surface`);
        }
      }
      const slim = slimTemplateVisualKitForFill(kit);
      if (!/Use ONLY the Motif vocabulary listed in THIS kit/i.test(slim)) {
        failures.push(`${folder}: fill slim missing THIS-kit Motif contract`);
      }
      if (/Example capsule|\.deco-pill pill-coral/i.test(slim) && !/capsule/i.test(folder)) {
        failures.push(`${folder}: foreign Capsule ornaments in tpl fill slim`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 60_000);

  it('slims fill kits with THIS-template Motif vocab — no foreign Daisy/Capsule ornaments', async () => {
    const files = await listOfficialDeckExamples();
    const failures: string[] = [];
    for (const { folder, examplePath } of files) {
      const html = await readFile(examplePath, 'utf8');
      const kit = extractTemplateVisualKitFromHtml(html, { title: folder });
      if (!kit) continue;
      const slim = slimTemplateVisualKitForFill(kit);
      const htmlVocab = new Set(extractMotifVocabularyClasses(html));
      const isDaisy = /daisy/i.test(folder);
      const isCapsule = /capsule/i.test(folder);

      if (!slim.includes('### Motif vocabulary (this template)')) {
        failures.push(`${folder}: missing Motif vocabulary (this template)`);
      }
      if (!/Use ONLY the Motif vocabulary listed in THIS kit/i.test(slim)) {
        failures.push(`${folder}: missing catalog-wide Motif contract`);
      }
      if (/Example capsule/i.test(slim) && !isCapsule) {
        failures.push(`${folder}: foreign Capsule example leaked into fill slim`);
      }
      if (/\.deco-pill\b/i.test(slim) && !htmlVocab.has('deco-pill') && !isCapsule) {
        failures.push(`${folder}: foreign .deco-pill leaked into fill slim`);
      }
      if (/Daisy Days identity|cover MUST show the provided daisy SVG/i.test(slim) && !isDaisy) {
        failures.push(`${folder}: Daisy-only identity leaked into fill slim`);
      }
      if (/Paste sprites VERBATIM|Copy at least one complete SVG from this block onto the cover/i.test(slim)) {
        failures.push(`${folder}: VERBATIM / cover-SVG mandate survived fill slim`);
      }
      const slimSvgs = slim.match(/<svg\s[\s\S]*?<\/svg>/gi) ?? [];
      for (const svg of slimSvgs) {
        if (svg.length > 900) {
          failures.push(`${folder}: fill slim kept oversized SVG (${svg.length})`);
        }
      }
      if (slimSvgs.length > 0 && !/AFTER title\/lead|AFTER a real cover/i.test(slim)) {
        failures.push(`${folder}: fill slim kept SVG without AFTER-title rule`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 60_000);
});
