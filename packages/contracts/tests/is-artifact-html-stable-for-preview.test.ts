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

  it("rejects documents whose body is only truncated CDN tag debris", () => {
    expect(
      isArtifactHtmlStableForPreview(`<!doctype html><html><head><title>T</title></head><body>
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
});
