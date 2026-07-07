import { describe, expect, it } from "vitest";

import { isArtifactHtmlStableForPreview } from "../src/html/isArtifactHtmlStableForPreview.js";

describe("isArtifactHtmlStableForPreview", () => {
  it("rejects empty and partial documents", () => {
    expect(isArtifactHtmlStableForPreview("")).toBe(false);
    expect(isArtifactHtmlStableForPreview("<!doctype html><html><head><title>T</title>")).toBe(false);
  });

  it("rejects documents with unclosed style or script tags", () => {
    expect(
      isArtifactHtmlStableForPreview(
        "<!doctype html><html><head><style>:root { --bg: #fff; }</head><body></body></html>",
      ),
    ).toBe(false);
    expect(
      isArtifactHtmlStableForPreview(
        "<!doctype html><html><body><script>(function(){})();</body></html>",
      ),
    ).toBe(false);
  });

  it("accepts a complete deck document", () => {
    const html = `<!doctype html><html><head><style>:root { --bg: #0D1117; }</style></head><body><section class="slide active">A</section><script>(function(){})();</script></body></html>`;
    expect(isArtifactHtmlStableForPreview(html)).toBe(true);
  });

  it("rejects complete documents with deck CSS/JS leaked as body text", () => {
    expect(
      isArtifactHtmlStableForPreview(`<!doctype html><html><head><title>T</title></head><body>
@import url('https://fonts.googleapis.com/css2');
.slide-inner { flex: 1; }
<section class="slide">A</section></body></html>`),
    ).toBe(false);
  });
});
