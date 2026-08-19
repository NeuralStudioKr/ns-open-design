import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildStandaloneDeckHtmlDocument,
  healDeckHtmlForStandaloneExport,
} from '../src/html/deckPdfExport';
import {
  LOOK_NEUTRALIZE_CSS,
  OFFICIAL_DECK_LOOK_STYLE_ATTR,
  OFFICIAL_DECK_MOTIF_HTML_ATTR,
  deckHtmlHasOfficialLookCss,
  ensureOfficialLookStackedCanvasNeutralize,
  extractOfficialDeckLookAssets,
  firstOfficialDeckTemplateId,
  listOfficialLookProofClasses,
  listOfficialMotifSymbolIds,
  lockStackedDeckCanvasForPreview,
  looksLikeOfficialFullscreenPresenterDeck,
  mergeOfficialDeckLookCss,
  needsStackedDesignViewportLock,
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
    expect(merged).toContain('position: relative !important');
    expect(merged).toContain('width: 1920px !important');
    expect(merged).toContain('shadcn/ui');
  });

  it('strips official presenter max-width media queries so scaled 16:9 preview does not reflow', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.css).toMatch(/@media\s*\(\s*max-width:\s*900px\s*\)/);
    const merged = mergeOfficialDeckLookCss(COMPACT_FILL, assets);
    const look = merged.match(/<style[^>]*data-od-official-look-css[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? '';
    expect(look).toContain('.pill-coral');
    expect(look).not.toMatch(/@media\s*\(\s*max-width/i);
    expect(look).toMatch(/flex-direction:\s*unset/);
    expect(merged).toContain('shadcn/ui');
  });

  it('heals a v18 official look sheet that still has max-width collapse rules', async () => {
    const { ensureOfficialLookStackedCanvasNeutralize } = await import('../src/html/deck-template-look-css.js');
    const stale = `<!doctype html><html><head>
<style data-od-official-look-css>
.slide { position:absolute; display:flex; flex-direction:column; }
.cards-grid { grid-template-columns:repeat(3,1fr); }
@media (max-width: 900px) {
  .slide { padding: 2rem; }
  .cards-grid { grid-template-columns: 1fr; }
  .timeline { flex-direction: column; }
}
/* stacked preview/export: Motif paint + fixed 1920×1080 canvas (not presentation absolute 100%) */
html, body { overflow: visible !important; height: auto !important; }
.slide { opacity: 1 !important; position: relative !important; width: 1920px !important; height: 1080px !important; flex-direction: unset; }
</style></head><body><section class="slide">cards</section></body></html>`;
    const healed = ensureOfficialLookStackedCanvasNeutralize(stale);
    const look = healed.match(/<style[^>]*data-od-official-look-css[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? '';
    expect(look).toContain('.cards-grid { grid-template-columns:repeat(3,1fr); }');
    expect(look).not.toMatch(/@media\s*\(\s*max-width/i);
    expect(look).toMatch(/flex-direction:\s*unset/);
    expect(healed).toContain('cards');
  });

  it('upgrades legacy opacity-only neutralize so absolute 100% slides stop clipping', async () => {
    const {
      ensureOfficialLookStackedCanvasNeutralize,
      lockDeckDesignViewportMeta,
      OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER,
    } = await import('../src/html/deck-template-look-css.js');
    const legacy = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style data-od-official-look-css>
.slide { position:absolute; inset:0; width:100%; height:100%; opacity:0; }
/* stacked preview/export: keep Motif paint, do not hide non-active slides */
html, body { overflow: visible !important; height: auto !important; }
.slide, .slide.active, .slide.is-active {
  opacity: 1 !important;
  pointer-events: auto !important;
}
</style></head><body><section class="slide slide-1"><div class="deco-pill"></div></section></body></html>`;
    const upgraded = lockDeckDesignViewportMeta(ensureOfficialLookStackedCanvasNeutralize(legacy));
    expect(upgraded).toContain(OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER);
    expect(upgraded).toContain('position: relative !important');
    expect(upgraded).toContain('width: 1920px !important');
    expect(upgraded).toMatch(/flex-direction:\s*unset/);
    expect(upgraded).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    expect(upgraded).not.toContain('width=device-width');
  });

  it('does not skip upgrade when only a poisoned neutralize marker comment exists', async () => {
    const {
      ensureOfficialLookStackedCanvasNeutralize,
      hasOfficialLookStackedCanvasNeutralizeProof,
      OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER,
    } = await import('../src/html/deck-template-look-css.js');
    const poisoned = `<!doctype html><html><head>
<style data-od-official-look-css>
.presentation > .slide { position:absolute; width:100%; height:100%; opacity:0; }
/* ${OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER} — truncated, missing relative/1920 rules */
</style></head><body><section class="slide"><div class="pill"></div></section></body></html>`;
    expect(hasOfficialLookStackedCanvasNeutralizeProof(poisoned)).toBe(false);
    const upgraded = ensureOfficialLookStackedCanvasNeutralize(poisoned);
    expect(hasOfficialLookStackedCanvasNeutralizeProof(upgraded)).toBe(true);
    expect(upgraded).toContain('position: relative !important');
    expect(upgraded).toContain('width: 1920px !important');
    expect(upgraded).toMatch(/flex-direction:\s*unset/);
    expect(upgraded).toContain('.presentation > .slide');
  });

  it('locks design viewport when merging official look CSS for persist', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE)!;
    const withDevice = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
</head><body><div class="slide"><h1>Topic</h1></div></body></html>`;
    const merged = mergeOfficialDeckLookCss(withDevice, assets);
    expect(merged).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    expect(merged).not.toContain('width=device-width');
    expect(merged).toContain('position: relative !important');
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

  it('keeps official Capsule example.html presenter Motif after standalone export heal', () => {
    const official = readFileSync(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'), 'utf8');
    const healed = healDeckHtmlForStandaloneExport(official);
    expect(looksLikeOfficialFullscreenPresenterDeck(healed)).toBe(true);
    // Export always pins design viewport for Motif vw/% + letterbox fit.
    expect(healed).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    // Presenter CSS must not get stacked-canvas neutralize (opacity stack stays authored).
    expect(healed).not.toContain('data-od-stacked-canvas-neutralize');
    expect(healed).not.toMatch(/flex-direction:\s*unset\s*;/);
    expect(healed).toContain('CAPSULE');
  });

  it('preview lock keeps Capsule on device-width (unlike standalone export heal)', () => {
    const official = readFileSync(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'), 'utf8');
    const preview = lockStackedDeckCanvasForPreview(official);
    expect(preview).not.toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    expect(preview).not.toContain('data-od-stacked-canvas-neutralize');
    expect(preview).toContain('CAPSULE');
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
      const lookCss = merged.match(/<style[^>]*data-od-official-look-css[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? '';
      if (/@media\s*\(\s*max-width/i.test(lookCss)) {
        failures.push(`${folder}: official look kept max-width media that reflows 16:9 preview`);
      }
      const symbolIds = listOfficialMotifSymbolIds(assets.motifHtml.join('\n'));
      for (const symbolId of symbolIds) {
        if (!new RegExp(`<symbol\\b[^>]*\\bid="${symbolId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').test(merged)) {
          failures.push(`${folder}: missing Motif symbol #${symbolId}`);
        }
      }
      if (assets.motifHtml.some((block) => /\bgrain-overlay\b/i.test(block)) && !/\bgrain-overlay\b/i.test(merged)) {
        failures.push(`${folder}: missing grain-overlay Motif host`);
      }
      if (assets.motifHtml.some((block) => /\bcrt-overlay\b/i.test(block)) && !/\bcrt-overlay\b/i.test(merged)) {
        failures.push(`${folder}: missing crt-overlay Motif host`);
      }
      if (
        assets.motifHtml.some((block) => /deco-daisy[\s\S]*?<svg\b|#fcdf6c/i.test(block))
        && !/deco-daisy[\s\S]{0,240}<svg\b[\s\S]{80,}?#fcdf6c/i.test(merged)
      ) {
        failures.push(`${folder}: missing Daisy Motif flower SVG (not just CSS / deco class)`);
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  }, 60_000);

  it('injects Pin #pin symbols into compact fill that only has <use href="#pin">', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-pin-and-paper/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(listOfficialMotifSymbolIds(assets.motifHtml.join('\n'))).toEqual(
      expect.arrayContaining(['pin', 'pin-open', 'arr', 'mark']),
    );
    const pinFill = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>:root{--paper:#F4EFE4}</style></head><body>
<div class="slide s-cover"><h1>Kept things</h1>
<svg class="pin-1" viewBox="0 0 360 110"><use href="#pin"/></svg>
</div></body></html>`;
    expect(pinFill).not.toContain('<symbol id="pin"');
    const merged = mergeOfficialDeckLookCss(pinFill, assets);
    expect(merged).toContain(`<symbol id="pin"`);
    expect(merged).toContain(`<symbol id="pin-open"`);
    expect(merged).toContain(OFFICIAL_DECK_MOTIF_HTML_ATTR);
    expect(merged).toContain('<use href="#pin"/>');
    expect(merged).toContain('Kept things');
    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);
  });

  it('still injects Motif HTML when look CSS is already present', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-pin-and-paper/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const cssOnly = mergeOfficialDeckLookCss(
      `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div class="slide"><h1>Topic</h1><svg><use href="#pin"/></svg></div></body></html>`,
      { ...assets, motifHtml: [] },
    );
    expect(cssOnly).toContain(OFFICIAL_DECK_LOOK_STYLE_ATTR);
    expect(cssOnly).not.toContain('<symbol id="pin"');
    const withMotif = mergeOfficialDeckLookCss(cssOnly, assets);
    expect(withMotif).toContain('<symbol id="pin"');
    expect(deckHtmlHasOfficialLookCss(cssOnly, assets)).toBe(true);
  });

  it('still injects Daisy flower SVG when the fill already has tiny decorative <svg> dots', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.css).not.toMatch(/\.cls-1\s*\{[^}]*#fcdf6c/i);
    expect(assets.motifHtml.some((block) => /deco-daisy[\s\S]*?<svg\b/i.test(block))).toBe(true);

    const linuxCover = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px;position:relative">
  <h1>Linux Internals for Senior Engineers</h1>
  <p>커널 아키텍처 · 스케줄러 · 메모리 서브시스템 · 시스템콜 경계 · 성능 튜닝까지 — 실무 딥다이브</p>
  <span style="border:3px solid #111;border-radius:14px;background:#7ECDC0;box-shadow:4px 4px 0 #111">Kernel 6.x</span>
  <span style="border:3px solid #111;border-radius:14px;background:#FDE366;box-shadow:4px 4px 0 #111">시니어 개발자 대상</span>
  <span style="border:3px solid #111;border-radius:14px;background:#F7C8D4;box-shadow:4px 4px 0 #111">Professional</span>
  <div style="position:absolute;bottom:24px;right:24px;display:flex;gap:8px">
    <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="none" stroke="#7ECDC0"/></svg>
    <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="none" stroke="#FDE366"/></svg>
    <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="none" stroke="#F7C8D4"/></svg>
  </div>
</section>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px;position:relative">
  <h2>Scheduler</h2>
  <p>CFS · runqueue · latency</p>
</section>
<section class="slide" style="background:#7ECDC0;width:1920px;height:1080px;position:relative">
  <h2>Memory</h2>
</section>
</body></html>`;

    const merged = mergeOfficialDeckLookCss(linuxCover, assets);
    expect(merged).toMatch(/deco-daisy[\s\S]{0,240}<svg\b[\s\S]{80,}?#fcdf6c/i);
    expect(merged).toMatch(/deco-star[\s\S]{0,400}<svg\b/i);
    expect(merged).toContain('Linux Internals for Senior Engineers');
    expect(merged).toContain('Kernel 6.x');
    expect((merged.match(/deco-daisy[\s\S]{0,240}<svg\b/gi) ?? []).length).toBeGreaterThanOrEqual(2);
    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);
  });

  it('injects Daisy Motif SVG instances into sparse compact fills (CSS alone cannot paint flowers)', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.motifHtml.some((block) => /deco-daisy[\s\S]*?<svg\b|#fcdf6c/i.test(block))).toBe(true);

    const sparseFill = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px;position:relative">
  <h1>Linux Internals for Senior Engineers</h1>
  <p>커널 아키텍처 · 스케줄러 · 메모리</p>
  <span style="border-radius:9999px;background:#A8D5C5">Kernel 6.x</span>
  <div style="position:absolute;bottom:24px;right:24px;display:flex;gap:8px">
    <i style="width:10px;height:10px;border-radius:50%;background:#A8D5C5"></i>
    <i style="width:10px;height:10px;border-radius:50%;background:#FDE366"></i>
    <i style="width:10px;height:10px;border-radius:50%;background:#FBB0C7"></i>
  </div>
</section>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px;position:relative">
  <h2>Scheduler</h2>
  <p>CFS · runqueue · latency</p>
</section>
</body></html>`;
    expect(sparseFill).not.toMatch(/#fcdf6c/i);

    const merged = mergeOfficialDeckLookCss(sparseFill, assets);
    expect(merged).toMatch(/#fcdf6c/i);
    expect(merged).toMatch(/deco-daisy/i);
    expect(merged).toContain(OFFICIAL_DECK_MOTIF_HTML_ATTR);
    expect(merged).toContain('Linux Internals for Senior Engineers');
    expect(merged).toContain('Scheduler');
    // Cover + one body slide should carry Motif.
    expect((merged.match(/#fcdf6c/gi) ?? []).length).toBeGreaterThanOrEqual(2);

    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);
  });

  it('fills empty Daisy deco shells with Motif SVG on merge', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const emptyShells = `<!doctype html><html lang="ko"><body>
<section class="slide" style="position:relative;background:#F5F0E6">
  <div class="deco deco-daisy-tl"></div>
  <div class="deco deco-daisy-br"></div>
  <h1>Topic</h1>
</section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(emptyShells, assets);
    expect(merged).toMatch(/deco-daisy-tl[\s\S]*?<svg\b[\s\S]*?#fcdf6c/i);
    expect(merged).toMatch(/deco-daisy-br[\s\S]*?<svg\b/i);
  });

  it('injects Capsule grain-overlay host from official example.html', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.motifHtml.join('')).toContain('grain-overlay');
    const merged = mergeOfficialDeckLookCss(COMPACT_FILL, assets);
    expect(merged).toMatch(/<div[^>]*grain-overlay/);
    expect(merged).toContain('shadcn/ui');
  });

  it('neutralizes official presenter layout so compact 16:9 split slides keep their row flex', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.css).toMatch(/flex-direction\s*:\s*column/);
    expect(assets.css).toMatch(/position\s*:\s*absolute/);

    const splitFill = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>
<section class="slide" style="display:flex;gap:0;padding:0;width:1920px;height:1080px">
  <div class="split-left"><h2>마이그레이션 전략</h2></div>
  <div class="split-right" style="width:620px;flex-shrink:0">마이그레이션 단계</div>
</section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(splitFill, assets);
    expect(merged).toContain(OFFICIAL_DECK_LOOK_STYLE_ATTR);
    expect(merged).toContain('stacked preview/export: Motif paint + fixed 1920');
    expect(merged).toMatch(/flex-direction:\s*unset/);
    expect(merged).toMatch(/position:\s*relative\s*!important/);
    expect(merged).toMatch(/inset:\s*auto\s*!important/);
    expect(merged).toMatch(/width:\s*1920px\s*!important/);
    expect(merged).toMatch(/height:\s*1080px\s*!important/);
    expect(merged).toContain('.pill-coral');
    expect(merged).toContain('마이그레이션 전략');
    expect(merged).not.toMatch(/flex-direction:\s*unset\s*!important/);

    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);
  });

  it('refreshes stale opacity-only neutralize on an already-merged official look sheet', () => {
    const stale = `<!doctype html><html><head>
<style data-od-official-look-css>
.slide { position:absolute; inset:0; width:100%; height:100%; display:flex; flex-direction:column; opacity:0; }
.pill-coral { background:#E85D4E; }
/* stacked preview/export: keep Motif paint, do not hide non-active slides */
html, body { overflow: visible !important; height: auto !important; }
.slide, .slide.active, .slide.is-active {
  opacity: 1 !important;
  pointer-events: auto !important;
}
</style></head><body>
<section class="slide" style="display:flex;padding:0">split</section>
</body></html>`;
    const refreshed = mergeOfficialDeckLookCss(stale, {
      css: '.slide{opacity:0}.pill-coral{background:#E85D4E}',
      fontLinks: [],
      motifHtml: [],
    });
    expect(refreshed).toContain('stacked preview/export: Motif paint + fixed 1920');
    expect(refreshed).toMatch(/flex-direction:\s*unset/);
    expect(refreshed).toContain('.pill-coral { background:#E85D4E; }');
    expect(refreshed).toContain('split');
  });

  it('does not lock official Capsule example.html to a stacked 1920 canvas', () => {
    const official = readFileSync(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'), 'utf8');
    expect(looksLikeOfficialFullscreenPresenterDeck(official)).toBe(true);
    const healed = ensureOfficialLookStackedCanvasNeutralize(official);
    expect(healed).not.toContain('data-od-stacked-canvas-neutralize');
    expect(healed).not.toContain('stacked preview/export: Motif paint + fixed 1920');
    expect(healed).toContain('position: absolute');
    expect(healed).toContain('width: 100%');
    expect(healed).toContain('CAPSULE');
  });

  it('opt-in locks viewport for fills — catalog presenters stay device-width', () => {
    const examples = listOfficialDeckExamplePaths();
    expect(examples.length).toBeGreaterThan(40);
    const presenterLocked: string[] = [];
    const neutralizedCatalog: string[] = [];
    let presenterHits = 0;
    for (const examplePath of examples) {
      const folder = examplePath.slice(EXAMPLES_DIR.length + 1).split('/')[0] ?? examplePath;
      const html = readFileSync(examplePath, 'utf8');
      const isPresenter = looksLikeOfficialFullscreenPresenterDeck(html);
      if (isPresenter) presenterHits += 1;
      const out = lockStackedDeckCanvasForPreview(html);
      if (isPresenter) {
        if (needsStackedDesignViewportLock(html)) presenterLocked.push(`${folder}:needsLock`);
        if (/content="width=1920/.test(out)) presenterLocked.push(`${folder}:meta1920`);
      }
      // Catalog examples must not gain stacked neutralize unless they already
      // carry official look CSS (fills only).
      if (
        !html.includes('data-od-official-look-css')
        && /data-od-stacked-canvas-neutralize/.test(out)
      ) {
        neutralizedCatalog.push(folder);
      }
    }
    expect(presenterHits).toBeGreaterThan(25);
    expect(presenterLocked).toEqual([]);
    expect(neutralizedCatalog).toEqual([]);
  });

  it('still locks compact fills that carry official look CSS to the 1920 canvas', () => {
    const compact = `<!doctype html><html><head>
<style data-od-official-look-css>
.slide{position:absolute;inset:0;width:100%;height:100%}
${LOOK_NEUTRALIZE_CSS}
</style></head><body>
<section class="slide">A</section><section class="slide">B</section>
</body></html>`;
    const out = lockStackedDeckCanvasForPreview(compact);
    expect(out).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    expect(out).toContain('position: relative !important');
  });

  it('does not treat body-first Motif absolute fills as catalog presenters', () => {
    // Filled compact decks often copy Capsule absolute Motif geometry into a
    // plain <style> without data-od-official-look-css. Those must stay on the
    // 1920 letterbox path — otherwise content lays out at device-width and
    // looks top-left / differently centered per slide.
    const motifFill = `<!doctype html><html><head><style>
.slide{position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column}
.pill{border-radius:9999px}
</style></head><body>
<section class="slide"><div class="pill">TOOLING</div><h1>Compare</h1></section>
<section class="slide"><h1>Roadmap</h1></section>
</body></html>`;
    expect(looksLikeOfficialFullscreenPresenterDeck(motifFill)).toBe(false);
    expect(needsStackedDesignViewportLock(motifFill)).toBe(true);
    const locked = lockStackedDeckCanvasForPreview(motifFill);
    expect(locked).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
  });

  it('strips a wrongly injected 1920 neutralize from an official presenter', () => {
    const poisoned = `<!doctype html><html><head>
<meta name="viewport" content="width=1920, initial-scale=1, maximum-scale=1" />
<style>
  .slide { position:absolute; inset:0; width:100%; height:100%; }
</style>
<style data-od-stacked-canvas-neutralize>${LOOK_NEUTRALIZE_CSS}</style>
</head><body>
<div class="presentation"><div class="slide slide-1 active">Cover</div></div>
<div class="nav-dots"><div class="nav-dot active"></div></div>
</body></html>`;
    expect(looksLikeOfficialFullscreenPresenterDeck(poisoned)).toBe(true);
    const healed = ensureOfficialLookStackedCanvasNeutralize(poisoned);
    expect(healed).not.toContain('data-od-stacked-canvas-neutralize');
    expect(healed).not.toContain('width: 1920px !important');
    expect(healed).toContain('width=device-width');
    expect(healed).toContain('Cover');
  });

  it('still locks persist-stripped compact fills that already have the stacked host', () => {
    const compact = `<!doctype html><html><head>
<style>.slide { position:absolute; inset:0; width:100%; height:100%; }</style>
</head><body>
<div id="od-stacked-deck-stage">
<section class="slide">Topic</section>
</div>
</body></html>`;
    const healed = ensureOfficialLookStackedCanvasNeutralize(compact);
    expect(healed).toContain('data-od-stacked-canvas-neutralize');
    expect(healed).toContain('width: 1920px !important');
    expect(healed).toContain('Topic');
  });

  it('resolves official deck template ids from metadata or skillIds', () => {
    expect(firstOfficialDeckTemplateId(
      null,
      '',
      ['other-skill', 'html-ppt-zhangzara-pin-and-paper'],
    )).toBe('html-ppt-zhangzara-pin-and-paper');
    expect(firstOfficialDeckTemplateId(
      'example-html-ppt-zhangzara-capsule',
      ['html-ppt-zhangzara-pin-and-paper'],
    )).toBe('example-html-ppt-zhangzara-capsule');
    expect(firstOfficialDeckTemplateId(['research-brief', 'web-fetch'])).toBeNull();
  });
});
