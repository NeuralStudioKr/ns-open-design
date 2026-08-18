import { readFileSync } from 'node:fs';
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
  mergeOfficialDeckLookCss,
} from '../src/html/deck-template-look-css';

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

describe('official deck look CSS merge', () => {
  it('extracts Capsule font links and Motif rules from example.html', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE);
    expect(assets).toBeTruthy();
    expect(assets!.fontLinks.join('')).toContain('fonts.googleapis.com/css2');
    expect(assets!.css).toContain('.pill-coral');
    expect(assets!.css).toContain('--coral:#E85D4E');
  });

  it('treats compact fill tokens + class names as missing look CSS', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE)!;
    expect(deckHtmlHasOfficialLookCss(COMPACT_FILL, assets)).toBe(false);
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
    const capsulePath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../plugins/_official/examples/html-ppt-zhangzara-capsule/example.html',
    );
    const official = readFileSync(capsulePath, 'utf8');
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.css).toContain('.pill-coral');
    const merged = mergeOfficialDeckLookCss(COMPACT_FILL, assets);
    expect(merged).toContain('.pill-coral');
    expect(merged).toContain('--coral');
    expect(merged).toContain('fonts.googleapis.com');
    expect(merged).toContain('shadcn/ui');
  });

  it('keeps Capsule Motif CSS after standalone export heal + document wrap', () => {
    const capsulePath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../plugins/_official/examples/html-ppt-zhangzara-capsule/example.html',
    );
    const official = readFileSync(capsulePath, 'utf8');
    const assets = extractOfficialDeckLookAssets(official)!;
    const healed = healDeckHtmlForStandaloneExport(COMPACT_FILL);
    const merged = mergeOfficialDeckLookCss(healed, assets);
    const standalone = buildStandaloneDeckHtmlDocument(merged);
    expect(standalone).toContain('.pill-coral');
    expect(standalone).toContain('fonts.googleapis.com');
    expect(standalone).toContain('--coral');
    expect(standalone).toContain('shadcn/ui');
  });
});
