import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
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
      if (kit.length > 16_000) failures.push(`${folder}: kit ${kit.length} > 16000`);
      if (/…\s*$/.test(kit) && kit.length >= 16_000) {
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


  it('preserves Motif vocabulary through extract + fill slim for ornament-heavy templates', async () => {
    const files = await listOfficialDeckExamples();
    const MOTIF_HINT =
      /\b(?:deco(?:-[a-z0-9_-]+)?|pill(?:-[a-z0-9_-]+)?|blob(?:-[a-z0-9_-]+)?|petal(?:s)?|stamp|tape|pin|doodle|scribble|shape|sticker|dot-grid|pixel(?:-[a-z0-9_-]+)?|ribbon|post-it|orb(?:-[a-z0-9_-]+)?|starfield|scanlines?)\b/i;
    const failures: string[] = [];
    let ornamentHeavy = 0;
    for (const { folder, examplePath } of files) {
      const html = await readFile(examplePath, 'utf8');
      const htmlMotifTokens = [...html.matchAll(
        /\b(?:deco(?:-[a-z0-9_-]+)?|pill(?:-[a-z0-9_-]+)?|blob(?:-[a-z0-9_-]+)?|petal(?:s)?|stamp|tape|\bpin\b|doodle|scribble|shape|sticker|dot-grid|pixel(?:-[a-z0-9_-]+)?|ribbon|post-it|orb(?:-[a-z0-9_-]+)?|starfield|scanlines?)\b/gi,
      )].map((m) => m[0]!.toLowerCase());
      const unique = [...new Set(htmlMotifTokens)].filter((tok) => tok !== 'pin' || /class=["'][^"']*\bpin\b/i.test(html));
      // Require Motif CSS presence (not just a random word match in prose).
      const hasMotifCss = MOTIF_HINT.test(html) && (
        /class=["'][^"']*\b(?:deco|pill-|blob|petal|stamp|tape|doodle|pixel-|post-it|dot-grid|shape|ribbon|orb)/i.test(html)
        || /\.(?:deco|pill-|blob|petal|stamp|tape|doodle|pixel-|post-it|dot-grid|shape|ribbon|orb)/i.test(html)
      );
      if (!hasMotifCss) continue;
      ornamentHeavy += 1;
      const kit = extractTemplateVisualKitFromHtml(html, { title: folder });
      if (!kit) {
        failures.push(`${folder}: kit null despite Motif HTML`);
        continue;
      }
      const slim = slimTemplateVisualKitForFill(kit);
      // At least one Motif token from HTML should survive extract.
      const kitHit = unique.some((tok) => kit.toLowerCase().includes(tok));
      if (!kitHit && !kit.includes('### Motif sprites') && !/### Decorations? CSS/i.test(kit)) {
        failures.push(`${folder}: Motif HTML present but kit has neither Motif sprites nor Decorations CSS`);
        continue;
      }
      const slimHit = unique.some((tok) => slim.toLowerCase().includes(tok));
      if (!slimHit && !/### Motif vocabulary \(required compact cue\)/i.test(slim) && !/### Motif sprites/i.test(slim)) {
        failures.push(`${folder}: Motif HTML present but slim dropped concrete Motif vocabulary`);
      }
      // Fill slim must keep Motif section(s) when extract had them.
      if (/### Motif sprites/i.test(kit) && !/### Motif sprites/i.test(slim)) {
        failures.push(`${folder}: Motif sprites dropped by slim`);
      }
      if (/### Decorations? CSS/i.test(kit) && !/### Decorations CSS \(capped/i.test(slim) && !/### Decorations CSS/i.test(slim)) {
        failures.push(`${folder}: Decorations CSS dropped by slim`);
      }
      if (/capsules?/i.test(folder) && !/capsule|pill/i.test(slim)) {
        failures.push(`${folder}: Capsule template title cue missing from slim`);
      }
      if (/daisy/i.test(folder) && !/daisy|flower|#fcdf6c/i.test(slim)) {
        failures.push(`${folder}: Daisy template title cue missing from slim`);
      }
      // Layout must be capped on fill when the full kit had Layout CSS.
      if (/### Layout CSS(?! \(omitted)/i.test(kit) && !/### Layout CSS \(capped/i.test(slim)) {
        failures.push(`${folder}: Layout CSS omitted by slim (should be capped)`);
      }
      if (/Layout CSS \(omitted for first content-fill/i.test(slim)) {
        failures.push(`${folder}: Layout CSS still fully omitted on fill`);
      }
      // Must not force Capsule-only guidance when kit has no true Capsule Motif.
      const hasCapsule =
        /\.deco-pill\b|deco-pills|floating-pills|\.pill-(?:coral|lime|lavender|sky|violet|yellow|peach|mint)/i.test(kit);
      if (!hasCapsule && /Example capsule \(AFTER title\)/i.test(slim)) {
        failures.push(`${folder}: slim injected Capsule example without Capsule Motif`);
      }
    }
    expect(ornamentHeavy, 'expected several ornament-heavy templates').toBeGreaterThan(8);
    expect(failures, failures.join('\n')).toEqual([]);
  }, 90_000);

  it('neutralizes Clone example.html for every official deck SKILL.md that has it', async () => {
    const files = await listOfficialDeckExamples();
    const stillCloning: string[] = [];
    for (const { folder, skillPath } of files) {
      if (!skillPath) continue;
      const skill = await readFile(skillPath, 'utf8');
      const hasFilesystemClone =
        /Clone\s+`?example\.html`?/i.test(skill)
        || /copy\s+`?index\.html`?/i.test(skill)
        || /Start from the matching template folder/i.test(skill)
        || /skills\/html-ppt\/templates\//i.test(skill);
      if (!hasFilesystemClone) continue;
      const neutralized = neutralizeFilesystemCloneWorkflow(skill);
      if (/\*\*Clone `example\.html`\*\*/i.test(neutralized)) {
        stillCloning.push(folder);
      }
      if (/copy\s+`index\.html`/i.test(neutralized)) {
        stillCloning.push(`${folder}: still instructs copy index.html`);
      }
      if (/skills\/html-ppt\/templates\//i.test(neutralized)) {
        stillCloning.push(`${folder}: still points at html-ppt templates path`);
      }
      if (!/do not clone files/i.test(neutralized)) {
        stillCloning.push(`${folder}: missing API-mode rewrite`);
      }
    }
    expect(stillCloning, stillCloning.join('\n')).toEqual([]);
  }, 60_000);

  it('binds .tpl-* identity surface instead of shared white :root', async () => {
    const files = await listOfficialDeckExamples();
    const failures: string[] = [];
    let identityDecks = 0;
    for (const { folder, examplePath } of files) {
      const html = await readFile(examplePath, 'utf8');
      const bodyClass = /<body\b[^>]*class\s*=\s*["']([^"']+)["']/i.exec(html)?.[1] ?? '';
      const tpl = bodyClass.split(/\s+/).find((cls) => /^(?:tpl|theme)-/i.test(cls));
      if (!tpl) continue;
      identityDecks += 1;
      const kit = extractTemplateVisualKitFromHtml(html, { title: folder });
      if (!kit) {
        failures.push(`${folder}: kit null despite .${tpl}`);
        continue;
      }
      if (!kit.includes(`Identity host class: \`.${tpl}\``)) {
        failures.push(`${folder}: missing Identity host class .${tpl}`);
      }
      const sharedWhite = /:root\s*\{[^}]*--(?:bg|surface)\s*:\s*#ffffff/i.test(html);
      const identityHost = new RegExp(
        `\\.${tpl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]+)\\}`,
        'i',
      ).exec(html)?.[1] ?? '';
      const identitySlide = new RegExp(
        `\\.${tpl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*\\.slide[^{]*\\{([^}]+)\\}`,
        'i',
      ).exec(html)?.[1] ?? '';
      const identitySurface = `${identityHost} ${identitySlide}`;
      const identityDark = /(?:^|[;{])\s*(?:background(?:-color)?|--(?:[a-z0-9_-]+-)?(?:bg|background|surface))\s*:\s*(?:#0[0-9a-f]{5}|#06060c)/i.test(
        identitySurface,
      );
      if (sharedWhite && identityDark && /\*\*background\*\*:\s*`#ffffff`/i.test(kit)) {
        failures.push(`${folder}: surface bound shared white instead of identity`);
      }
    }
    expect(identityDecks, 'expected html-ppt identity decks').toBeGreaterThan(8);
    expect(failures, failures.join('\n')).toEqual([]);
  }, 60_000);
});
