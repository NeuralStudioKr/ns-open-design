import { describe, expect, it } from 'vitest';

import {
  buildDeckFlattenScriptTag,
  buildDeckSlideExportLayoutHelperJs,
  buildDeckPrintCss,
  injectDeckFlattenScript,
  patchArtifactDeckPrintCss,
  stripStaleDeckExportArtifacts,
} from '../src/html/deckPdfExport.js';

describe('stripStaleDeckExportArtifacts', () => {
  it('removes previously injected deck print styles and flatten scripts', () => {
    const html = `<html><head>
<style data-deck-print="injected">@media print { .slide { flex-direction: column !important; } }</style>
<script data-deck-print-flatten>window.__odFlattenDeckForPrint=function(){}</script>
<style>body{color:red}</style>
</head><body></body></html>`;
    const out = stripStaleDeckExportArtifacts(html);
    expect(out).not.toContain('data-deck-print');
    expect(out).not.toContain('data-deck-print-flatten');
    expect(out).toContain('body{color:red}');
  });

  it('removes untagged export preamble and static HTML fallback styles', () => {
    const html = `<html><head><title>deck</title>
<style type="text/css">
html, body { margin: 0 !important; background: #fff !important; scrollbar-width: none !important; }
*::-webkit-scrollbar { display: none !important; }
.deck-counter { display: none !important; }
</style>
<style data-teamver-static-html-export-fallback>html, body { margin: 0 !important; }</style>
<style>body{color:red}</style>
</head><body></body></html>`;
    const out = stripStaleDeckExportArtifacts(html);
    expect(out).not.toContain('background: #fff !important');
    expect(out).not.toContain('data-teamver-static-html-export-fallback');
    expect(out).toContain('body{color:red}');
  });
});

describe('patchArtifactDeckPrintCss', () => {
  it('strips stale injected print CSS and removes column flex overrides', () => {
    const html = `<style data-deck-print="injected">
@media print {
  .slide, [data-screen-label] {
    display: flex !important;
    flex-direction: column !important;
  }
}
</style>`;
    const out = patchArtifactDeckPrintCss(html);
    expect(out).not.toContain('flex-direction: column !important');
    expect(out).not.toContain('data-deck-print');
  });

  it('rewrites white html/body print backgrounds to CSS variables', () => {
    const input = `@media print { html, body { background: #fff !important; } }`;
    const out = patchArtifactDeckPrintCss(input);
    expect(out).toContain('background: var(--shell, var(--bg, #fff)) !important');
    expect(out).not.toContain('background: #fff !important');
  });

  it('cleans exported deck HTML polluted by prior headless snapshots', () => {
    const html = `<!DOCTYPE html><html><head><title>deck</title><style type="text/css">
html, body { margin: 0 !important; background: #fff !important; scrollbar-width: none !important; }
*::-webkit-scrollbar { display: none !important; }
</style><style data-od-headless-pdf="">
@media print {
  .slide { display: flex !important; flex-direction: column !important; }
}
</style></head><body><section class="slide active"></section></body></html>`;
    const out = patchArtifactDeckPrintCss(html);
    expect(out).not.toContain('data-od-headless-pdf');
    expect(out).not.toContain('flex-direction: column !important');
    expect(out).not.toMatch(/html\s*,\s*body\s*\{[^}]*background\s*:\s*#fff\s*!important/i);
  });
});

describe('buildDeckSlideExportLayoutHelperJs', () => {
  it('preserves column splits and handles s-inner / cover-right-panel', () => {
    const js = buildDeckSlideExportLayoutHelperJs();
    expect(js).toContain('cover-right-panel');
    expect(js).toContain('s-inner');
    expect(js).toContain('split');
    expect(js).toContain('preserveNestedLayouts');
    expect(js).toContain('sideBySide ? \'row\' : \'column\'');
  });
});

describe('buildDeckPrintCss', () => {
  it('includes shared flatten rules and guizang fallbacks', () => {
    const css = buildDeckPrintCss();
    expect(css).toContain('@media print');
    expect(css).toContain('.slide:not(.active)');
    expect(css).toContain('.slide.hero.dark::before');
    expect(css).not.toContain('flex-direction: column !important');
  });
});

describe('injectDeckFlattenScript', () => {
  it('defines window.__odFlattenDeckForPrint', () => {
    const doc = injectDeckFlattenScript('<html><head></head><body></body></html>');
    expect(doc).toContain('data-deck-print-flatten');
    expect(doc).toContain('window.__odFlattenDeckForPrint');
    expect(doc).toContain('resolveSlidePrintBackground');
  });

  it('matches buildDeckFlattenScriptTag output shape', () => {
    const tag = buildDeckFlattenScriptTag();
    expect(tag.startsWith('<script data-deck-print-flatten>')).toBe(true);
    expect(tag.endsWith('</script>')).toBe(true);
  });
});
