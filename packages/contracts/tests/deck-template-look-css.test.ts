import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildStandaloneDeckHtmlDocument,
  healDeckHtmlForStandaloneExport,
} from '../src/html/deckPdfExport';
import {
  OFFICIAL_DECK_LOOK_STYLE_ATTR,
  deckHtmlHasOfficialLookCss,
  extractOfficialDeckLookAssets,
  listOfficialLookProofClasses,
  mergeOfficialDeckLookCss,
} from '../src/html/deck-template-look-css';
import {
  listLocalStylesheetHrefs,
  resolveSiblingAssetPath,
} from '../src/template-visual-kit';

const CAPSULE_EXAMPLE = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900&family=Space+Grotesk:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root { --bg:#F5F5F0; --coral:#E85D4E; --font-display:'Bodoni Moda', serif; }
  .slide { opacity:0; position:absolute; inset:0; }
  .slide.active { opacity:1; }
  .pill { border-radius:9999px; border:2px solid #1E1E1E; }
  .pill-coral { background: var(--coral); }
  .pill-lime { background: #C4D94E; }
  .grain-overlay { opacity:0.04; }
  .slide-1 { background: radial-gradient(#fff, var(--bg)); }
</style></head><body></body></html>`;

const COMPACT_FILL = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>
<style>:root{--bg:#F5F5F0;--coral:#E85D4E}</style>
<div class="slide"><h1>shadcn/ui</h1><p>Copy, Don't Install</p>
<div class="pill pill-coral"></div></div>
<div class="slide"><h2>Radix</h2><p>Architecture</p></div>
</body></html>`;

/** Compact fill that copied generic kit layout chrome — must not skip Motif CSS. */
const GENERIC_LAYOUT_COMPACT = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
:root{--bg:#FAFAFA;--text:#111}
.slide{background:var(--bg)}
.slide-1{background:var(--bg)}
.slide-title{font-size:48px}
.slide-hero{display:flex}
.slide-inner{padding:24px}
.slide-weekly{display:grid}
</style></head><body>
<div class="slide slide-1"><h1>Topic</h1></div>
</body></html>`;

const EXAMPLES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../plugins/_official/examples',
);

function loadOfficialLookSource(examplePath: string): string {
  const html = readFileSync(examplePath, 'utf8');
  const previewRel = examplePath.slice(EXAMPLES_DIR.length + 1).replace(/\\/g, '/');
  const sheets: string[] = [];
  for (const href of listLocalStylesheetHrefs(html).slice(0, 3)) {
    const assetPath = resolveSiblingAssetPath(previewRel, href);
    if (!assetPath) continue;
    try {
      const css = readFileSync(join(EXAMPLES_DIR, assetPath), 'utf8');
      if (css.trim()) sheets.push(css);
    } catch {
      /* missing sibling is a catalog gap the merge must still survive */
    }
  }
  if (sheets.length === 0) return html;
  return `${html}\n<style data-od-kit-supplemental>\n${sheets.join('\n')}\n</style>`;
}

function listOfficialDeckExamplePaths(): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(EXAMPLES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folder = join(EXAMPLES_DIR, entry.name);
    let manifest: string;
    try {
      manifest = readFileSync(join(folder, 'open-design.json'), 'utf8');
    } catch {
      continue;
    }
    if (!/"mode"\s*:\s*"deck"/i.test(manifest)) continue;
    const examplePath = join(folder, 'example.html');
    let html: string;
    try {
      html = readFileSync(examplePath, 'utf8');
    } catch {
      continue;
    }
    if (/<iframe\b/i.test(html) && !/<style\b[^>]*>[\s\S]*:root/i.test(html)) continue;
    out.push(examplePath);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

describe('official deck look CSS merge', () => {
  it('extracts Capsule font links and Motif rules from example.html', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE);
    expect(assets).toBeTruthy();
    expect(assets!.fontLinks.join('')).toContain('fonts.googleapis.com/css2');
    expect(assets!.css).toContain('.pill-coral');
    expect(assets!.css).toContain('--coral:#E85D4E');
  });

  it('promotes @import webfonts to stylesheet links', () => {
    const html = `<html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap');
:root { --bg:#111; --accent:#0f0; }
.hc-scan { opacity:0.2; }
</style></head><body></body></html>`;
    const assets = extractOfficialDeckLookAssets(html)!;
    expect(assets.fontLinks.join('')).toContain('fonts.googleapis.com/css2?family=Inter');
  });

  it('treats compact fill tokens + class names as missing look CSS', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE)!;
    expect(deckHtmlHasOfficialLookCss(COMPACT_FILL, assets)).toBe(false);
  });

  it('does not treat generic .slide-N / .slide-title chrome as official look CSS', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE)!;
    expect(listOfficialLookProofClasses(assets.css)).toContain('pill-coral');
    expect(listOfficialLookProofClasses(assets.css)).not.toContain('slide-1');
    expect(deckHtmlHasOfficialLookCss(GENERIC_LAYOUT_COMPACT, assets)).toBe(false);
  });

  it('does not treat a kit Motif snippet as the full official stylesheet', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const kitSnippet = `<!doctype html><html><head><style>
.pill { border-radius:9999px; border:2px solid #1E1E1E; }
.pill-coral { background: var(--coral); }
</style></head><body><div class="slide"><div class="pill pill-coral"></div></div></body></html>`;
    expect(deckHtmlHasOfficialLookCss(kitSnippet, assets)).toBe(false);
    const merged = mergeOfficialDeckLookCss(kitSnippet, assets);
    expect(merged).toContain(OFFICIAL_DECK_LOOK_STYLE_ATTR);
    expect(merged).toContain('.grain-overlay');
  });

  it('injects Capsule Motif CSS and fonts into a compact fill deck', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE)!;
    const merged = mergeOfficialDeckLookCss(COMPACT_FILL, assets);
    expect(merged).toContain(OFFICIAL_DECK_LOOK_STYLE_ATTR);
    expect(merged).toContain('.pill-coral { background: var(--coral); }');
    expect(merged).toContain('fonts.googleapis.com/css2');
    expect(merged).toContain('opacity: 1 !important');
    expect(merged).toContain('shadcn/ui');
  });

  it('is idempotent when Motif rules or the look marker already exist', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE)!;
    const once = mergeOfficialDeckLookCss(COMPACT_FILL, assets);
    const twice = mergeOfficialDeckLookCss(once, assets);
    expect(twice).toBe(once);
    expect(deckHtmlHasOfficialLookCss(once, assets)).toBe(true);
  });

  it('applies official Capsule example Motif CSS to a compact fill snapshot', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.css).toContain('.pill-coral');
    const merged = mergeOfficialDeckLookCss(COMPACT_FILL, assets);
    expect(merged).toContain('.pill-coral');
    expect(merged).toContain('--coral');
    expect(merged).toContain('fonts.googleapis.com');
    expect(merged).toContain('shadcn/ui');
  });

  it('keeps Capsule Motif CSS after standalone export heal + document wrap', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const healed = healDeckHtmlForStandaloneExport(COMPACT_FILL);
    const merged = mergeOfficialDeckLookCss(healed, assets);
    const standalone = buildStandaloneDeckHtmlDocument(merged);
    expect(standalone).toContain('.pill-coral');
    expect(standalone).toContain('fonts.googleapis.com');
    expect(standalone).toContain('--coral');
    expect(standalone).toContain('shadcn/ui');
  });

  it('merges official look CSS for every mode:deck example.html into generic compact fill', () => {
    const examples = listOfficialDeckExamplePaths();
    expect(examples.length).toBeGreaterThan(40);
    const failures: string[] = [];

    for (const examplePath of examples) {
      const folder = examplePath.slice(EXAMPLES_DIR.length + 1).split('/')[0] ?? examplePath;
      const official = loadOfficialLookSource(examplePath);
      const assets = extractOfficialDeckLookAssets(official);
      if (!assets?.css || assets.css.length < 80) {
        failures.push(`${folder}: no extractable look CSS`);
        continue;
      }
      if (deckHtmlHasOfficialLookCss(GENERIC_LAYOUT_COMPACT, assets)) {
        failures.push(`${folder}: generic slide chrome falsely counted as look CSS`);
        continue;
      }
      const merged = mergeOfficialDeckLookCss(GENERIC_LAYOUT_COMPACT, assets);
      if (!merged.includes(OFFICIAL_DECK_LOOK_STYLE_ATTR)) {
        failures.push(`${folder}: missing official look style marker`);
      }
      if (!merged.includes('Topic')) {
        failures.push(`${folder}: compact fill content dropped`);
      }
      const proof = listOfficialLookProofClasses(assets.css);
      const expected = proof[0];
      if (expected && !new RegExp(`\\.${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(merged)) {
        failures.push(`${folder}: missing proof class .${expected}`);
      }
      const hasOfficialFont =
        /fonts\.googleapis\.com|fonts\.gstatic\.com|db\.onlinewebfonts\.com/i.test(official);
      if (hasOfficialFont && !/fonts\.googleapis\.com|fonts\.gstatic\.com|db\.onlinewebfonts\.com/i.test(merged)) {
        failures.push(`${folder}: official webfonts not carried into merge`);
      }
      const standalone = buildStandaloneDeckHtmlDocument(
        mergeOfficialDeckLookCss(healDeckHtmlForStandaloneExport(GENERIC_LAYOUT_COMPACT), assets),
      );
      if (expected && !new RegExp(`\\.${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(standalone)) {
        failures.push(`${folder}: standalone wrap dropped .${expected}`);
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  }, 60_000);
});
