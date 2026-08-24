import { describe, expect, it } from "vitest";

import { isArtifactHtmlStableForPreview } from "../src/html/isArtifactHtmlStableForPreview.js";
import { DECK_SKELETON_HTML } from "../src/prompts/deck-framework.js";
import { repairArtifactDocumentHead } from "../src/html/repairArtifactDocumentHead.js";

describe("isArtifactHtmlStableForPreview", () => {
  it("rejects empty and partial documents", () => {
    expect(isArtifactHtmlStableForPreview("")).toBe(false);
    expect(isArtifactHtmlStableForPreview("<!doctype html><html><head><title>T</title>")).toBe(false);
  });

  it("accepts the canonical deck-framework skeleton despite <style> text in CSS comments", () => {
    // Agents copy DECK_SKELETON_HTML verbatim. CSS comments historically
    // contained the literal string "<style>" which naive open-tag counting
    // treated as an unclosed style — permanently stuck preview loading.
    expect(isArtifactHtmlStableForPreview(DECK_SKELETON_HTML)).toBe(true);
    expect(isArtifactHtmlStableForPreview(repairArtifactDocumentHead(DECK_SKELETON_HTML))).toBe(true);
  });

  it("ignores instructional <style>/<script> copies inside CSS and HTML comments", () => {
    const html = `<!doctype html><html><head>
<style>
  /* Do not edit this <style> block. Also ignore <script> mentions. */
  :root { --bg: #fff; }
</style>
<!-- example: <style>.x{}</style> <script>alert(1)</script> -->
</head><body><section class="slide">A</section></body></html>`;
    expect(isArtifactHtmlStableForPreview(html)).toBe(true);
  });

  it("ignores <script>/<style> string literals inside closed raw blocks", () => {
    const html = `<!doctype html><html><head>
<style>:root { --bg: #fff; }</style>
</head><body>
<section class="slide">A</section>
<script>
  const tip = "<script>alert(1)</script>";
  const cssTip = "<style>.x{}</style>";
</script>
</body></html>`;
    expect(isArtifactHtmlStableForPreview(html)).toBe(true);
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

  it("rejects documents whose body is only truncated CDN tag debris", () => {
    expect(
      isArtifactHtmlStableForPreview(`<!doctype html><html><head><title>T</title></head><body>
googleapis.com" />
</body></html>`),
    ).toBe(false);
  });

  it("does not treat slide-counter chrome as a slide root when body is CDN debris", () => {
    expect(
      isArtifactHtmlStableForPreview(`<!doctype html><html><head><title>T</title></head><body>
<div class="slide-counter">5 / 10</div>
googleapis.com" />
</body></html>`),
    ).toBe(false);
  });

  it("rejects complete documents with bare CDN host lines or truncated head tags in body", () => {
    expect(
      isArtifactHtmlStableForPreview(`<!doctype html><html><head><title>T</title></head><body>
<section class="slide">A</section>
fonts.googleapis.com
</body></html>`),
    ).toBe(false);
    expect(
      isArtifactHtmlStableForPreview(`<!doctype html><html><head><title>T</title></head><body>
<section class="slide">A</section>
<link rel="stylesheet" href="https://fonts.google
</body></html>`),
    ).toBe(false);
  });

  it("rejects complete documents with CDN host+path or family@ void debris in body", () => {
    expect(
      isArtifactHtmlStableForPreview(`<!doctype html><html><head><title>T</title></head><body>
<section class="slide">A</section>
fonts.googleapis.com/css2?family=Inter
</body></html>`),
    ).toBe(false);
    expect(
      isArtifactHtmlStableForPreview(`<!doctype html><html><head><title>T</title></head><body>
<section class="slide">A</section>
cdn.jsdelivr.net/npm/foo
</body></html>`),
    ).toBe(false);
    expect(
      isArtifactHtmlStableForPreview(`<!doctype html><html><head><title>T</title></head><body>
<section class="slide">A</section>
family=Inter:wght@400;700&display=swap" />
</body></html>`),
    ).toBe(false);
  });

  it("rejects bunny/fontshare/esm bare hosts and href=/family= orphans in body", () => {
    expect(
      isArtifactHtmlStableForPreview(`<!doctype html><html><head><title>T</title></head><body>
<section class="slide">A</section>
fonts.bunny.net
</body></html>`),
    ).toBe(false);
    expect(
      isArtifactHtmlStableForPreview(`<!doctype html><html><head><title>T</title></head><body>
<section class="slide">A</section>
esm.sh/foo
</body></html>`),
    ).toBe(false);
    expect(
      isArtifactHtmlStableForPreview(`<!doctype html><html><head><title>T</title></head><body>
<section class="slide">A</section>
href="https://fonts.googleapis.com/css2" />
</body></html>`),
    ).toBe(false);
    expect(
      isArtifactHtmlStableForPreview(`<!doctype html><html><head><title>T</title></head><body>
<section class="slide">A</section>
family=Inter" />
</body></html>`),
    ).toBe(false);
  });

  it("rejects documents with unclosed svg, math, or HTML comments", () => {
    expect(
      isArtifactHtmlStableForPreview(
        `<!doctype html><html><head></head><body><svg><circle/><section class="slide">A</section></body></html>`,
      ),
    ).toBe(false);
    expect(
      isArtifactHtmlStableForPreview(
        `<!doctype html><html><head></head><body><math><mi>x</mi><section class="slide">A</section></body></html>`,
      ),
    ).toBe(false);
    expect(
      isArtifactHtmlStableForPreview(
        `<!doctype html><html><head></head><body><!-- note<section class="slide">A</section></body></html>`,
      ),
    ).toBe(false);
  });

  it("ignores <!-- inside closed script strings for HTML comment balance", () => {
    const html = `<!doctype html><html><head></head><body>
<section class="slide"><h1>A</h1><p>Enough slide copy for preview.</p></section>
<script>(function(){ var s = "<!-- not a comment"; })();</script>
</body></html>`;
    expect(isArtifactHtmlStableForPreview(html)).toBe(true);
  });

  it("ignores unterminated CSS comments inside a closed style block", () => {
    const html = `<!doctype html><html><head><style>
/* Do not copy this <style> mention
:root { --bg: #fff; }
</style></head><body>
<section class="slide"><h1>A</h1><p>Enough slide copy for preview.</p></section>
</body></html>`;
    expect(isArtifactHtmlStableForPreview(html)).toBe(true);
  });
});
