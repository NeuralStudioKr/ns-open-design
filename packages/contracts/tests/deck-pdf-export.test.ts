import { describe, expect, it } from 'vitest';

import {
  buildDeckFlattenScriptTag,
  buildDeckSlideExportLayoutHelperJs,
  buildDeckPrintCss,
  buildDeckHtmlExportScreenCss,
  buildDeckHtmlExportStaticRevealScript,
  buildDeckHtmlExportViewportScript,
  buildStandaloneDeckHtmlDocument,
  healDeckHtmlForStandaloneExport,
  injectDeckHtmlExportViewportScript,
  buildDeckHtmlExportFinalizeLayoutJs,
  injectDeckFlattenScript,
  patchArtifactDeckPrintCss,
  stripStaleDeckExportArtifacts,
  buildDeckPdfPagePdfOptions,
  buildDeckBrowserPrintScaleCss,
  buildDeckPdfPageAtRule,
  deckPdfPrintScale,
  DECK_PDF_PAGE_WIDTH_IN,
  DECK_PDF_PAGE_HEIGHT_IN,
  DECK_HTML_EXPORT_FIT_PAD_PX,
  DECK_CHROME_HIDE_SELECTOR,
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
    expect(out).not.toContain('data-od-html-export-reveal');
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

  it('rewrites @page 1920px to PPT inches so MediaBox is not ~20″', () => {
    const html = `<style>@media print { @page { size: 1920px 1080px; margin: 0; } }</style>`;
    const out = patchArtifactDeckPrintCss(html);
    expect(out).toContain(`size: ${DECK_PDF_PAGE_WIDTH_IN}in ${DECK_PDF_PAGE_HEIGHT_IN}in`);
    expect(out).not.toMatch(/size:\s*1920px\s+1080px/);
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

  it('promotes wrapper ::before/::after background layers onto slides before unwrap', () => {
    // Cobalt-grid paints graph paper on .stage::before. display:contents on
    // wrappers drops those pseudo boxes, so export must clone painted layers.
    const js = buildDeckSlideExportLayoutHelperJs();
    expect(js).toContain('promoteWrapperBackgroundDecorations');
    expect(js).toContain('collectWrapperDecorationLayers');
    expect(js).toContain('data-od-export-deco');
    expect(js).toContain('applySlideExportSurface');
    expect(js).toContain("set(el, 'background-color', color)");
    expect(js).toContain('ensureEmojiFontFallbacks');
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
    expect(css).toContain('display: block !important');
    expect(css).not.toMatch(/\n\s*flex-direction:\s*column\s*!important/);
    // PPT inches — not 1920px (@page px → ~20″ MediaBox at 96dpi).
    expect(css).toContain(`@page { size: ${DECK_PDF_PAGE_WIDTH_IN}in ${DECK_PDF_PAGE_HEIGHT_IN}in; margin: 0; }`);
    expect(css).not.toMatch(/@page\s*\{\s*size:\s*1920px/);
  });
});

describe('buildDeckPdfPagePdfOptions', () => {
  it('uses PPT inch paper + scale so 1920 CSS px fits viewer 100%', () => {
    const opts = buildDeckPdfPagePdfOptions();
    expect(opts.preferCSSPageSize).toBe(false);
    expect(opts.width).toBe(`${DECK_PDF_PAGE_WIDTH_IN}in`);
    expect(opts.height).toBe(`${DECK_PDF_PAGE_HEIGHT_IN}in`);
    expect(opts.scale).toBeCloseTo(2 / 3, 5);
    expect(deckPdfPrintScale()).toBe(opts.scale);
    expect(opts.width).not.toContain('px');
  });

  it('exposes shared @page inches and browser-only print zoom', () => {
    expect(buildDeckPdfPageAtRule()).toBe(
      `@page { size: ${DECK_PDF_PAGE_WIDTH_IN}in ${DECK_PDF_PAGE_HEIGHT_IN}in; margin: 0; }`,
    );
    const zoomCss = buildDeckBrowserPrintScaleCss();
    expect(zoomCss).toContain('@media print');
    expect(zoomCss).toMatch(/zoom:\s*0\.666/);
  });
});

describe('DECK_CHROME_HIDE_SELECTOR', () => {
  it('hides nav chrome but keeps Motif grain/crt overlays for export', () => {
    expect(DECK_CHROME_HIDE_SELECTOR).toContain('#nav');
    expect(DECK_CHROME_HIDE_SELECTOR).toContain('canvas.bg');
    expect(DECK_CHROME_HIDE_SELECTOR).not.toContain('grain-overlay');
    expect(DECK_CHROME_HIDE_SELECTOR).not.toContain('crt-overlay');
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
    // Do not force display:block on slides — preserves Capsule flex centering.
    expect(css).not.toMatch(
      /\.slide[^{]*\{[^}]*display:\s*block\s*!important/,
    );
    // Stage must keep template paper/::before grid (not forced transparent).
    expect(css).not.toMatch(
      /\.deck,\s*\.deck-stage[\s\S]{0,500}background:\s*transparent\s*!important/,
    );
    expect(css).toMatch(/background:\s*var\(--bg,[^)]*var\(--paper/);
    expect(css).not.toContain('background: var(--shell, #0a0c10)');
    expect(css).not.toContain('box-shadow: 0 12px 48px');
    expect(css).not.toMatch(/\.slide[^{]*\{[^}]*flex-direction:\s*column\s*!important/);
  });
});

describe('buildDeckHtmlExportStaticRevealScript', () => {
  it('reveals inactive slides and preserves flex without forcing block', () => {
    const script = buildDeckHtmlExportStaticRevealScript();
    expect(script).toContain("classList.add('active')");
    expect(script).toContain('.deck-counter');
    expect(script).toContain('.nav-dots');
    expect(script).toContain("display', 'none', 'important'");
    expect(script).toContain("removeProperty('display')");
    expect(script).toContain("display === 'flex'");
    expect(script).not.toContain("display', 'block', 'important'");
  });
});

describe('buildStandaloneDeckHtmlDocument', () => {
  it('heals Motif CSS and stacks all slides with paper-first screen CSS', () => {
    const remnant =
      "1,6..96,400..900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');";
    const html = `<!doctype html><html><head><style>${remnant}
:root{--bg:#F5F5F0;--coral:#E85D4E;--outline:#1E1E1E}
.deco-pill{position:absolute;border-radius:9999px;border:2px solid var(--outline)}
.slide{position:absolute;opacity:0}.slide.active{opacity:1}
.nav-dots{position:fixed;bottom:12px}
</style></head><body>
<section class="slide active" style="width:1920px;height:1080px;background:radial-gradient(circle,#F5F5F0,#eee)"><div class="deco-pill" style="width:160px;height:60px;background:var(--coral)">Hi</div></section>
<section class="slide" style="width:1920px;height:1080px;background:#F5F5F0"><h1>Two</h1></section>
<div class="nav-dots">dots</div>
</body></html>`;
    const healed = healDeckHtmlForStandaloneExport(html);
    expect(healed).toMatch(/\.deco-pill\{/);
    expect(healed).not.toMatch(/display=swap/i);
    const out = buildStandaloneDeckHtmlDocument(html);
    expect(out).toContain('data-teamver-static-html-export-fallback');
    expect(out).toContain('data-od-html-export-reveal');
    expect(out).toContain('data-od-html-export-viewport');
    expect(out).toContain(`content="width=1920"`);
    expect(out).toMatch(/var\(--bg,\s*var\(--paper/);
    expect(out).not.toContain('background: var(--shell, #0a0c10)');
    expect(out).toContain('.nav-dots');
    expect(out).not.toContain("display', 'block', 'important'");
  });

  it('relaxes persisted .slide surface bleed before Motif stylesheet heal', () => {
    const html = `<!doctype html><html><head></head><body>
<section class="slide slide-1">Cover</section>
<style data-od-slide-surface-bleed="">html, body, .slide, section.slide { background: #F5F5F0 !important; color: #1A1A1A !important; }</style>
<style>.deco-pill{position:absolute;border-radius:9999px}</style>
</body></html>`;
    const healed = healDeckHtmlForStandaloneExport(html);
    expect(healed).toMatch(/html,\s*body\s*\{[^}]*background:\s*#F5F5F0/i);
    expect(healed).not.toMatch(/html,\s*body,\s*\.slide,\s*section\.slide/i);
    expect(healed).toMatch(/\.deco-pill\{/);
  });
});

describe('buildDeckHtmlExportViewportScript', () => {
  it('letterboxes W+H like preview with pad 32', () => {
    const script = buildDeckHtmlExportViewportScript();
    expect(script).toContain('--od-html-export-scale');
    expect(script).toContain('window.addEventListener(\'resize\'');
    expect(script).toContain('visualViewport');
    expect(script).toContain('1920');
    expect(script).toContain('1080');
    expect(script).toContain(String(DECK_HTML_EXPORT_FIT_PAD_PX));
    expect(script).toContain('(vp.h - PAD) / SLIDE_H');
  });
});

describe('injectDeckHtmlExportViewportScript', () => {
  it('appends viewport script before </body> without executing during export', () => {
    const html = '<html><head></head><body><section class="slide"></section></body></html>';
    const out = injectDeckHtmlExportViewportScript(html);
    expect(out).toContain('data-od-html-export-viewport');
    expect(out.indexOf('data-od-html-export-viewport')).toBeGreaterThan(out.indexOf('<section'));
    expect(out).toContain('</body>');
  });
});

describe('buildDeckHtmlExportFinalizeLayoutJs', () => {
  it('clears print-flatten inline sizing and locks viewport to 1920', () => {
    const script = buildDeckHtmlExportFinalizeLayoutJs();
    expect(script).toContain('removeProperty');
    expect(script).toContain('break-after');
    expect(script).toContain('meta[name="viewport"]');
    expect(script).toContain('--od-html-export-scale');
    expect(script).toContain("content', 'width=1920'");
    expect(script).not.toMatch(/setAttribute\('content',\s*'width=device-width/);
  });
});

describe('injectDeckFlattenScript', () => {
  it('defines window.__odFlattenDeckForPrint', () => {
    const doc = injectDeckFlattenScript('<html><head></head><body></body></html>');
    expect(doc).toContain('data-deck-print-flatten');
    expect(doc).toContain('window.__odFlattenDeckForPrint');
    expect(doc).toContain('resolveSlidePrintBackground');
  });

  it('promotes wrapper decorations and uses background-color (not shorthand)', () => {
    const tag = buildDeckFlattenScriptTag();
    expect(tag).toContain('promoteWrapperBackgroundDecorations(slides)');
    expect(tag).toContain('applySlideExportSurface(el,resolveSlidePrintBackground(el))');
    expect(tag).toContain("set(document.documentElement,'background-color',pageBg)");
    expect(tag).not.toMatch(/set\(document\.documentElement,'background',pageBg\)/);
    expect(tag).toContain('ensureEmojiFontFallbacks(document)');
  });

  it('matches buildDeckFlattenScriptTag output shape', () => {
    const tag = buildDeckFlattenScriptTag();
    expect(tag.startsWith('<script data-deck-print-flatten>')).toBe(true);
    expect(tag.endsWith('</script>')).toBe(true);
  });
});
