import { describe, expect, it } from "vitest";

import {
  deckPreviewSrcDoc,
  pagePreviewSrcDoc,
} from "../../src/teamver/components/ProjectCardHtmlCover";

describe("ProjectCardHtmlCover srcDoc builders", () => {
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
});
