import { describe, expect, it } from "vitest";

import {
  hasArtifactPreviewBodyTextLeaks,
  stripArtifactPreviewBodyTextLeaks,
} from "../src/html/artifactPreviewTextLeaks.js";
import { isArtifactHtmlStableForPreview } from "../src/html/isArtifactHtmlStableForPreview.js";

const LEAKED_DECK_BODY = `<!doctype html><html><head><title>Deck</title></head><body>
/ ── Per-deck styles ── /
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
.slide-inner {
  flex: 1 1 auto;
}
<section class="slide active">A</section>
</body></html>`;

const LEAKED_DECK_SCRIPT = `<!doctype html><html><head><title>Deck</title></head><body>
(function () {
var stage = document.getElementById('deck-stage');
function fit() {
  var sw = window.innerWidth;
}
<section class="slide active">A</section>
</body></html>`;

describe("artifactPreviewTextLeaks", () => {
  it("detects deck CSS leaked into body text", () => {
    expect(hasArtifactPreviewBodyTextLeaks(LEAKED_DECK_BODY)).toBe(true);
  });

  it("detects deck JS leaked into body text", () => {
    expect(hasArtifactPreviewBodyTextLeaks(LEAKED_DECK_SCRIPT)).toBe(true);
  });

  it("ignores the same CSS when it lives inside a closed style tag", () => {
    const html = `<!doctype html><html><head><style>
/ ── Per-deck styles ── /
@import url('https://fonts.googleapis.com/css2');
.slide-inner { flex: 1; }
</style></head><body><section class="slide active">A</section></body></html>`;
    expect(hasArtifactPreviewBodyTextLeaks(html)).toBe(false);
  });

  it("strips leaked deck CSS/JS fragments from body", () => {
    const cssOut = stripArtifactPreviewBodyTextLeaks(LEAKED_DECK_BODY);
    expect(cssOut).not.toMatch(/@import\s+url/i);
    expect(cssOut).not.toMatch(/\.slide-inner\s*\{/);
    expect(cssOut).toContain('<section class="slide active">A</section>');

    const jsOut = stripArtifactPreviewBodyTextLeaks(LEAKED_DECK_SCRIPT);
    expect(jsOut).not.toMatch(/deck-stage/);
    expect(jsOut).toContain('<section class="slide active">A</section>');
  });

  it("blocks preview stability while body text leaks remain", () => {
    expect(isArtifactHtmlStableForPreview(LEAKED_DECK_BODY)).toBe(false);
    expect(isArtifactHtmlStableForPreview(LEAKED_DECK_SCRIPT)).toBe(false);
  });
});
