import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { pluginPreviewSrcDoc } from "../../src/runtime/authenticatedHtmlSrcDoc";
import {
  deckPreviewSrcDoc,
  extractCoverSlideSections,
  htmlLooksLikeMultiSlideDeck,
  isolateFirstDeckSlideHtml,
  pagePreviewSrcDoc,
  buildHtmlCoverSrcDoc,
  pluginCatalogPreviewSrcDoc,
  stampIsolatedCoverSlideVisible,
} from "../../src/teamver/htmlCoverSrcDoc";

const repoRoot = resolve(import.meta.dirname, "../../../..");
const PINK_SCRIPT = readFileSync(
  resolve(repoRoot, "plugins/_official/examples/html-ppt-zhangzara-pink-script/example.html"),
  "utf8",
);
import { parseProjectRawUrl } from "../../src/teamver/components/ProjectCardHtmlCover";

describe("ProjectCardHtmlCover srcDoc builders", () => {
  it("parses project raw URLs for scoped preview base resolution", () => {
    expect(parseProjectRawUrl("/api/projects/p1/raw/slides/deck.html")).toEqual({
      projectId: "p1",
      filePath: "slides/deck.html",
    });
    expect(parseProjectRawUrl("/api/projects/p%2Fweird/raw/a%20b.html")).toEqual({
      projectId: "p/weird",
      filePath: "a b.html",
    });
    expect(parseProjectRawUrl("https://example.com/api/projects/p1/raw/x.html")).toBeNull();
  });

  it("strips cache-bust query from raw URLs before scoped preview mint", () => {
    expect(
      parseProjectRawUrl("/api/projects/d5dbcdc5-2152-4bc0-b142-eead945fbdd4/raw/deck.html?v=1785228266675"),
    ).toEqual({
      projectId: "d5dbcdc5-2152-4bc0-b142-eead945fbdd4",
      filePath: "deck.html",
    });
    expect(parseProjectRawUrl("/api/projects/p1/raw/deck.html?v=1#frag")).toEqual({
      projectId: "p1",
      filePath: "deck.html",
    });
  });

  it("preserves relative asset resolution with a base href for page previews", () => {
    const srcDoc = pagePreviewSrcDoc(
      '<html><head><link rel="stylesheet" href="./style.css"></head><body></body></html>',
      '/api/projects/p1/raw/deck/index.html?cacheBust=1&x="y"',
    );

    expect(srcDoc).toContain(
      '<base href="/api/projects/p1/raw/deck/index.html?cacheBust=1&amp;x=&quot;y&quot;">',
    );
    expect(srcDoc).toContain('id="od-page-card-preview"');
    expect(srcDoc).not.toContain("<script");
  });

  it("strips canvas CSP base-uri none so card thumbs do not violate CSP", () => {
    const srcDoc = pagePreviewSrcDoc(
      `<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'self'; script-src 'none'; base-uri 'none'; form-action 'none'"/>
</head><body><img src="data:image/gif;base64,xx"></body></html>`,
      "/api/projects/p1/raw/refs/drive/canvas.html?v=1",
    );
    expect(srcDoc).toContain('<base href="/api/projects/p1/raw/refs/drive/canvas.html?v=1">');
    expect(srcDoc).not.toMatch(/base-uri\s+'none'/i);
    expect(srcDoc).toContain("img-src data:");
  });

  it("does not add a duplicate base tag for deck previews", () => {
    const srcDoc = deckPreviewSrcDoc(
      '<html><head><base href="/already/"><script>bad()</script></head><body></body></html>',
      '/api/projects/p1/raw/deck.html',
    );

    expect(srcDoc.match(/<base\b/g)).toHaveLength(1);
    expect(srcDoc).toContain('id="od-deck-card-preview"');
    expect(srcDoc).not.toContain("<script");
  });

  it("uses the 1920×1080 Teamver canvas and sibling combinators for later slides", () => {
    const srcDoc = deckPreviewSrcDoc(
      '<html><head></head><body><section></section><section class="slide">One</section><section class="slide">Two</section></body></html>',
      '/api/projects/p1/raw/deck.html',
    );
    expect(srcDoc).toContain('width: 1920px !important');
    expect(srcDoc).toContain('height: 1080px !important');
    expect(srcDoc).toContain('.slide ~ .slide');
    expect(srcDoc).toContain('One');
    expect(srcDoc).not.toContain('>Two<');
    expect(srcDoc).not.toContain('.slide:not(:first-of-type)');
  });

  it("heals cover HTML with stacked-canvas neutralize and design viewport lock", () => {
    const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style data-od-official-look-css>
.slide { position:absolute; inset:0; width:100%; height:100%; opacity:0; }
/* stacked preview/export: Motif paint + fixed 1920 — poisoned marker without relative rules */
</style>
</head><body>
<section class="slide"><div class="pill-coral">Cover</div></section>
<section class="slide">Later</section>
</body></html>`;
    const srcDoc = buildHtmlCoverSrcDoc(html, "/api/projects/p1/raw/deck.html", { preferDeck: true });
    expect(srcDoc).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    expect(srcDoc).not.toContain("width=device-width");
    expect(srcDoc).toContain("position: relative !important");
    expect(srcDoc).toContain("Cover");
    expect(srcDoc).not.toContain(">Later<");
  });

  it("removes later slides from the cover DOM so absolute/manual-edit chrome cannot bleed", () => {
    const html = `<html><head></head><body>
<section class="slide"><h1>NeuralStudio</h1></section>
<section class="slide"><div style="position:absolute;left:100px;top:200px">AI EDUCATION</div>
<div style="position:absolute">FEATURED PROJECT</div></section>
</body></html>`;
    const isolated = isolateFirstDeckSlideHtml(html);
    expect(isolated).toContain("NeuralStudio");
    expect(isolated).not.toContain("AI EDUCATION");
    expect(isolated).not.toContain("FEATURED PROJECT");
    expect(isolated.match(/class="slide"/g)).toHaveLength(1);

    const srcDoc = deckPreviewSrcDoc(html, "/api/projects/p1/raw/deck.html");
    expect(srcDoc).toContain("NeuralStudio");
    expect(srcDoc).not.toContain("AI EDUCATION");
    expect(srcDoc).toContain('id="od-deck-card-preview-trail"');
  });

  it("isolates div.slide and data-slide-index dialects", () => {
    const divDeck = `<html><body>
<div class="slide">Cover</div>
<div class="slide"><div style="position:absolute">Bleed</div></div>
</body></html>`;
    expect(isolateFirstDeckSlideHtml(divDeck)).toContain("Cover");
    expect(isolateFirstDeckSlideHtml(divDeck)).not.toContain("Bleed");

    const indexed = `<html><body>
<section data-slide-index="0">First</section>
<section data-slide-index="1">Second abs</section>
</body></html>`;
    expect(isolateFirstDeckSlideHtml(indexed)).toContain("First");
    expect(isolateFirstDeckSlideHtml(indexed)).not.toContain("Second abs");
  });

  it("keeps nested .slide inside the first slide when isolating", () => {
    const html = `<html><body>
<section class="slide">Outer<div class="slide">Nested</div></section>
<section class="slide">LaterBleed</section>
</body></html>`;
    const isolated = isolateFirstDeckSlideHtml(html);
    expect(isolated).toContain("Outer");
    expect(isolated).toContain("Nested");
    expect(isolated).not.toContain("LaterBleed");
    expect(extractCoverSlideSections(html)).toHaveLength(2);
  });

  it("upgrades page-mode covers to deck isolation when HTML is multi-slide", () => {
    const html = `<html><head></head><body>
<section class="slide">HomeHero</section>
<section class="slide">TrackRecord</section>
</body></html>`;
    expect(htmlLooksLikeMultiSlideDeck(html)).toBe(true);
    const srcDoc = buildHtmlCoverSrcDoc(html, "/api/projects/p1/raw/deck.html", {
      preferDeck: false,
    });
    expect(srcDoc).toContain("HomeHero");
    expect(srcDoc).not.toContain("TrackRecord");
    expect(srcDoc).toContain('id="od-deck-card-preview"');
  });

  it("heals persisted css2 debris and flatten bleed before minting a deck cover", () => {
    const html = `<html><head><style>
1,6..96,400..900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
:root{--bg:#F5F5F0;--coral:#E85D4E}
.slide-1{background:radial-gradient(ellipse at 20% 80%, rgba(200,217,78,0.15) 0%, transparent 50%), #F5F5F0}
.pill{border-radius:9999px}
</style></head><body>
<section class="slide slide-1"><span class="pill">shadcn/ui</span></section>
<style data-od-slide-surface-bleed="">html, body, .slide, section.slide { background: #F5F5F0 !important; color: #1A1A1A !important; }</style>
</body></html>`;
    const srcDoc = deckPreviewSrcDoc(html, "/api/projects/p1/raw/deck.html");
    expect(srcDoc).not.toMatch(/1,6\.\.96/i);
    expect(srcDoc).toContain(":root{--bg:#F5F5F0;--coral:#E85D4E}");
    expect(srcDoc).toContain(".pill{border-radius:9999px}");
    expect(srcDoc).toContain("radial-gradient");
    expect(srcDoc).not.toMatch(
      /html,\s*body,\s*\.slide,\s*section\.slide\s*\{[^}]*background:\s*#F5F5F0\s*!important/i,
    );
  });

  it("does not inject stacked 1920 neutralize into official presenter thumbs", () => {
    const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  html, body { width:100%; height:100%; overflow:hidden; }
  .slide { position:absolute; inset:0; width:100%; height:100%; opacity:0; }
  .slide.active { opacity:1; }
</style>
</head><body>
<div class="presentation">
  <div class="slide slide-1 active"><h1>CAPSULE</h1></div>
  <div class="slide slide-2"><h1>Thought</h1></div>
</div>
<div class="nav-dots"><div class="nav-dot active"></div></div>
</body></html>`;
    const srcDoc = buildHtmlCoverSrcDoc(html, "/api/plugins/html-ppt-zhangzara-capsule/example");
    expect(srcDoc).toContain("CAPSULE");
    expect(srcDoc).not.toContain("Thought");
    expect(srcDoc).not.toContain("data-od-stacked-canvas-neutralize");
    expect(srcDoc).not.toContain("stacked preview/export: Motif paint + fixed 1920");
    expect(srcDoc).not.toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    expect(srcDoc).toContain("width=device-width");
    expect(srcDoc).toContain('id="od-deck-card-preview"');
  });

  it("forces the isolated html-ppt cover slide visible despite presenter opacity:0", () => {
    const html = `<html><head><style>
.slide{opacity:0;pointer-events:none;transform:translateX(30px)}
.slide.is-active{opacity:1}
</style></head><body>
<section class="slide"><h1>Filled brief title</h1></section>
<section class="slide is-active"><h1>Later slide</h1></section>
</body></html>`;
    const srcDoc = deckPreviewSrcDoc(html, "/api/projects/p1/raw/deck.html");
    expect(srcDoc).toContain("Filled brief title");
    expect(srcDoc).not.toContain("Later slide");
    expect(srcDoc).toMatch(/opacity:\s*1\s*!important/);
    expect(srcDoc).toMatch(/visibility:\s*visible\s*!important/);
    expect(srcDoc).toMatch(/transform:\s*none\s*!important/);
  });

  it("isolates Pink Script catalog thumbs to the cover (no deck-stage.js, no Index)", () => {
    expect(htmlLooksLikeMultiSlideDeck(PINK_SCRIPT)).toBe(true);
    const live = pluginPreviewSrcDoc(
      PINK_SCRIPT,
      "/api/plugins/example-html-ppt-zhangzara-pink-script/preview",
    );
    expect(live).toContain("deck-stage.js");
    expect(live).toContain("The Index");

    const thumb = pluginCatalogPreviewSrcDoc(
      PINK_SCRIPT,
      "/api/plugins/example-html-ppt-zhangzara-pink-script/preview",
    );
    expect(thumb).toContain("After");
    expect(thumb).toContain("Hours");
    expect(thumb).toContain('id="od-deck-card-preview"');
    expect(thumb).toMatch(/deck-stage,/);
    expect(thumb).not.toContain("deck-stage.js");
    expect(thumb).not.toContain("The Index");
    expect(thumb).toContain("<base href=");
  });

  it("stamps the isolated cover so inactive-only presenter CSS still paints", () => {
    const html = `<html><body>
<section class="slide" data-title="Cover"><h1>Pitch</h1></section>
<section class="slide" data-title="Agenda"><h1>Agenda</h1></section>
</body></html>`;
    const stamped = stampIsolatedCoverSlideVisible(isolateFirstDeckSlideHtml(html));
    expect(stamped).toMatch(/(?:^|[\s"'])active(?:[\s"']|$)/);
    expect(stamped).toMatch(/(?:^|[\s"'])is-active(?:[\s"']|$)/);
    expect(stamped).toContain('data-deck-active="1"');
    expect(stamped).toContain("Pitch");
    expect(stamped).not.toContain("Agenda");
  });

  it("reveals display:none + data-anim dialects used by non-Pink templates", () => {
    const blockFrame = `<html><head><style>
.slide { display:none; opacity:0 }
.slide.active { display:flex; opacity:1 }
[data-anim] { opacity:0 }
.slide.is-active [data-anim] { opacity:1 }
</style></head><body>
<div class="slides-container">
  <section class="slide"><h1>Block Cover</h1><p data-anim="fade-up">Lead</p></section>
  <section class="slide"><h1>Later Bleed</h1></section>
</div>
</body></html>`;
    const thumb = pluginCatalogPreviewSrcDoc(blockFrame, "/api/plugins/example-html-ppt-block/preview");
    expect(thumb).toContain("Block Cover");
    expect(thumb).toContain("Lead");
    expect(thumb).not.toContain("Later Bleed");
    expect(thumb).toContain('data-deck-active="1"');
    expect(thumb).toMatch(/(?:^|[\s"'])active(?:[\s"']|$)/);
    expect(thumb).toMatch(/(?:^|[\s"'])is-active(?:[\s"']|$)/);
    expect(thumb).toContain(".slides-container");
    expect(thumb).toContain("[data-anim]");
  });

  it("isolates creative-mode sections that are not class=slide", () => {
    const html = `<html><body>
<deck-stage>
  <section class="s1" data-screen-label="01 Title"><h1>Creative Cover</h1></section>
  <section class="s2" data-screen-label="02 Agenda"><h1>Creative Later</h1></section>
</deck-stage>
<script src="assets/deck-stage.js"></script>
</body></html>`;
    expect(htmlLooksLikeMultiSlideDeck(html)).toBe(true);
    const thumb = pluginCatalogPreviewSrcDoc(html, "/api/plugins/example-html-ppt-creative/preview");
    expect(thumb).toContain("Creative Cover");
    expect(thumb).not.toContain("Creative Later");
    expect(thumb).not.toContain("deck-stage.js");
    expect(thumb).toContain('data-deck-active="1"');
    expect(extractCoverSlideSections(thumb)).toHaveLength(1);
  });

  it("isolates every official html-ppt catalog thumb to one stamped cover", () => {
    const examplesDir = resolve(repoRoot, "plugins/_official/examples");
    const dirs = readdirSync(examplesDir).filter((name) => name.startsWith("html-ppt-"));
    expect(dirs.length).toBeGreaterThan(20);
    const failures: string[] = [];
    for (const dir of dirs) {
      const html = readFileSync(resolve(examplesDir, dir, "example.html"), "utf8");
      const slides = extractCoverSlideSections(html);
      if (slides.length < 2) continue;
      const thumb = pluginCatalogPreviewSrcDoc(html, `/api/plugins/example-${dir}/preview`);
      const remaining = extractCoverSlideSections(thumb);
      const coverOpen = remaining[0]?.openTag ?? "";
      const problems: string[] = [];
      if (!thumb.includes('id="od-deck-card-preview"')) problems.push("missing cover css");
      if (/deck-stage\.js/i.test(thumb)) problems.push("kept deck-stage.js");
      if (remaining.length !== 1) problems.push(`remaining=${remaining.length}`);
      if (!/\bdata-deck-active\b/i.test(coverOpen)) problems.push("cover not stamped");
      if (!/(?:^|[\s"'])active(?:[\s"']|$)/i.test(coverOpen)) problems.push("missing active");
      if (!/(?:^|[\s"'])is-active(?:[\s"']|$)/i.test(coverOpen)) problems.push("missing is-active");
      if (problems.length) failures.push(`${dir}: ${problems.join("; ")}`);
    }
    expect(failures).toEqual([]);
  });
});
