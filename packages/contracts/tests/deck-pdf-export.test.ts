import { describe, expect, it } from 'vitest';

import {
  buildDeckFlattenScriptTag,
  buildDeckSlideExportLayoutHelperJs,
  buildDeckPrintCss,
  buildDeckHtmlExportScreenCss,
  buildDeckHtmlExportStaticRevealScript,
  buildDeckHtmlExportViewportScript,
  buildDeckHtmlExportFinalizeLayoutJs,
  injectDeckFlattenScript,
  patchArtifactDeckPrintCss,
  stripStaleDeckExportArtifacts,
} from '../src/html/deckPdfExport.js';

describe('stripStaleDeckExportArtifacts', () => {
  it('removes previously injected deck print styles and flatten scripts', () => {
    const html = `<html><head>
<style data-deck-print="injected">@media print { .slide { flex-direction: column !important; } }</style>
<script data-deck-print-flatten>window.__odFlattenDeckForPrint=function(){}</script>
<style data-od-html-export-screen>html { width: 100%; }</style>
<script data-od-html-export-viewport>window.__odHtmlExportFit=function(){}</script>
<script data-od-html-export-reveal>window.__odHtmlExportReveal=function(){}</script>
<style>body{color:red}</style>
</head><body></body></html>`;
    const out = stripStaleDeckExportArtifacts(html);
    expect(out).not.toContain('data-deck-print');
    expect(out).not.toContain('data-deck-print-flatten');
    expect(out).not.toContain('data-od-html-export-screen');
    expect(out).not.toContain('data-od-html-export-viewport');
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

  it('rewrites white html/body print backgrounds to the paper CSS variable chain', () => {
    const input = `@media print { html, body { background: #fff !important; } }`;
    const out = patchArtifactDeckPrintCss(input);
    // Paper (var(--bg)) must win over frame chrome (var(--shell)) so light-theme
    // decks (--bg: #FAFAFA) do not render dark PDF pages.
    expect(out).toContain('background: var(--bg, var(--paper, var(--shell, #fff))) !important');
    expect(out).not.toContain('background: #fff !important');
  });

  it('rewrites shell-first print backgrounds to the paper CSS variable chain', () => {
    const input = `@media print { html, body { background: var(--shell, var(--bg)) !important; } }`;
    const out = patchArtifactDeckPrintCss(input);
    expect(out).toContain('background: var(--bg, var(--paper, var(--shell)) !important');
    expect(out).not.toContain('var(--shell, var(--bg)');
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

  it('does not force cover slides into a CSS grid (that split slide-footer onto a second PDF page)', () => {
    // The former grid rewrite for cover slides pushed .slide-footer onto its
    // own page whenever the 1fr row + auto row calc exceeded 1080px by a
    // fraction of a pixel. The absolute-positioned original layout is now
    // preserved as-is.
    const js = buildDeckSlideExportLayoutHelperJs();
    // The cover branch must exist (still short-circuits so the default
    // layout pass does not clobber cover-right-panel), but must NOT reassign
    // the slide's display to `grid`.
    expect(js).toContain('coverContent && rightPanel');
    expect(js).not.toMatch(/coverContent && rightPanel[\s\S]*?set\(slide,\s*['"]display['"],\s*['"]grid['"]\)/);
    expect(js).not.toMatch(/set\(slide,\s*['"]grid-template-columns['"]/);
    expect(js).not.toMatch(/set\(slide,\s*['"]grid-template-rows['"]/);
  });

  it('falls back to the deck-stage / paper color for slides without an explicit background', () => {
    const js = buildDeckSlideExportLayoutHelperJs();
    expect(js).toContain('resolveSlidePaperBackground');
    expect(js).toContain('.deck-stage');
    expect(js).toMatch(/resolveSlidePaperBackground\s*\(\s*\)/);
    expect(js).toMatch(
      /getPropertyValue\(['"]--bg['"]\)[\s\S]{0,120}getPropertyValue\(['"]--paper['"]\)[\s\S]{0,120}getPropertyValue\(['"]--shell['"]\)/,
    );
  });

  it('preserves deck-framework flex column layout instead of forcing display:block', () => {
    const js = buildDeckSlideExportLayoutHelperJs();
    expect(js).toContain('preserveSlideFlexLayout');
    expect(js).toMatch(/if\s*\(\s*preserveSlideFlexLayout\(slide\)\s*\)\s*return/);
  });

  it('emits syntactically valid browser layout helper JS', () => {
    const js = buildDeckSlideExportLayoutHelperJs();
    const set = () => {};
    expect(() => {
      // eslint-disable-next-line no-new-func
      new Function('set', js);
    }).not.toThrow();
  });
});

describe('buildDeckPrintCss', () => {
  it('includes shared flatten rules and guizang fallbacks', () => {
    const css = buildDeckPrintCss();
    expect(css).toContain('@media print');
    expect(css).toContain('.slide:not(.active)');
    expect(css).toContain('.slide.hero.dark::before');
    expect(css).toContain('flex-direction: column !important');
  });
});

describe('buildDeckHtmlExportScreenCss', () => {
  it('uses viewport-friendly screen layout instead of print flatten', () => {
    const css = buildDeckHtmlExportScreenCss();
    expect(css).toContain('width: 100% !important');
    expect(css).toContain('zoom: var(--od-html-export-scale, 1) !important');
    expect(css).toContain('.slide:not(.active)');
    expect(css).toContain('.deck-shell');
    expect(css).toContain('position: static !important');
    expect(css).not.toContain('display: contents !important');
    expect(css).not.toContain('break-after: page !important');
    expect(css).not.toContain('@media print');
  });
});

describe('buildDeckHtmlExportStaticRevealScript', () => {
  it('reveals inactive slides and hides deck chrome', () => {
    const script = buildDeckHtmlExportStaticRevealScript();
    expect(script).toContain("classList.add('active')");
    expect(script).toContain('.deck-counter');
    expect(script).toContain("display', 'none', 'important'");
  });
});

describe('buildDeckHtmlExportViewportScript', () => {
  it('sets --od-html-export-scale on load and resize', () => {
    const script = buildDeckHtmlExportViewportScript();
    expect(script).toContain('--od-html-export-scale');
    expect(script).toContain('window.addEventListener(\'resize\'');
    expect(script).toContain('1920');
  });
});

describe('buildDeckHtmlExportFinalizeLayoutJs', () => {
  it('clears print-flatten inline sizing from html/body and slides', () => {
    const script = buildDeckHtmlExportFinalizeLayoutJs();
    expect(script).toContain('removeProperty');
    expect(script).toContain('break-after');
    expect(script).toContain('meta[name="viewport"]');
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
