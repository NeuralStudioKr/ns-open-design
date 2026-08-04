import { describe, expect, it } from "vitest";

import {
  deckPreviewSrcDoc,
  isolateFirstDeckSlideHtml,
  pagePreviewSrcDoc,
  parseProjectRawUrl,
} from "../../src/teamver/components/ProjectCardHtmlCover";

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
});
