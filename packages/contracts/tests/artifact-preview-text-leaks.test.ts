import { describe, expect, it } from "vitest";

import {
  hasArtifactPreviewBodyTextLeaks,
  stripArtifactPreviewBodyTextLeaks,
} from "../src/html/artifactPreviewTextLeaks.js";
import { isArtifactHtmlStableForPreview } from "../src/html/isArtifactHtmlStableForPreview.js";
import { repairArtifactDocumentHead } from "../src/html/repairArtifactDocumentHead.js";

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

  it("blocks preview stability while truncated viewport meta leaks remain", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
-width, initial-scale=1" />
<section class="slide active">A</section>
</body></html>`;
    expect(hasArtifactPreviewBodyTextLeaks(leaked)).toBe(true);
    expect(isArtifactHtmlStableForPreview(leaked)).toBe(false);
  });

  it("preserves full deck theme CSS through repair + strip pipeline", () => {
    const html = `<!doctype html><html><head><style>
/ ── Per-deck styles ── /
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
:root { --bg: #FAFAFA; --accent: #2F6FEB; --navy: #0D1117; }
.s-cover { background: var(--navy); color: #fff; }
.slide-inner { flex: 1 1 auto; padding: 80px 120px; }
.eyebrow { font-size: 13px; color: var(--accent); }
</style><title>Deck</title></head><body><div id="deck-stage"><section class="slide active s-cover"><p class="eyebrow">AI 도입 효과</p><h1>기업 AI 도입의 실질적 효과</h1></section></div></body></html>`;
    const repaired = repairArtifactDocumentHead(html);
    expect(repaired).toContain("--bg: #FAFAFA");
    expect(repaired).toContain(".s-cover { background: var(--navy)");
    expect(repaired).toContain("@import url('https://fonts.googleapis.com/css2");
    expect(repaired).toContain("AI 도입 효과");
    expect(hasArtifactPreviewBodyTextLeaks(repaired)).toBe(false);
    expect(isArtifactHtmlStableForPreview(repaired)).toBe(true);
  });
});
