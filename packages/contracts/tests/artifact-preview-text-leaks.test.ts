import { describe, expect, it } from "vitest";

import {
  hasArtifactPreviewBodyTextLeaks,
  repairMangledDeckFrameworkScript,
  stripArtifactPreviewBodyTextLeaks,
  stripDeckOrphansBeforeRootFromBodyInner,
  buildArtifactPreviewDomLeakGuardScript,
  buildArtifactPreviewDomLeakStripScript,
} from "../src/html/artifactPreviewTextLeaks.js";
import { isArtifactHtmlStableForPreview } from "../src/html/isArtifactHtmlStableForPreview.js";
import { repairArtifactDocumentHead } from "../src/html/repairArtifactDocumentHead.js";
import { DECK_SKELETON_HTML } from "../src/prompts/deck-framework.js";

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

  it("detects viewport=width=device-width text leaks", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
viewport=width=device-width, initial-scale=1" />
<section class="slide active">A</section>
</body></html>`;
    expect(hasArtifactPreviewBodyTextLeaks(leaked)).toBe(true);
    const out = stripArtifactPreviewBodyTextLeaks(leaked);
    expect(out).not.toMatch(/viewport=width=device-width/i);
    expect(out).toContain('<section class="slide active">A</section>');
  });

  it("blocks preview stability while truncated viewport meta leaks remain", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
-width, initial-scale=1" />
<section class="slide active">A</section>
</body></html>`;
    expect(hasArtifactPreviewBodyTextLeaks(leaked)).toBe(true);
    expect(isArtifactHtmlStableForPreview(leaked)).toBe(false);
  });

  it("preserves deck-framework fit() script inside closed body script tags", () => {
    const out = stripArtifactPreviewBodyTextLeaks(DECK_SKELETON_HTML);
    expect(out).toMatch(
      /<script>\s*\(function\s*\(\)\s*\{\s*var\s+stage\s*=\s*document\.getElementById\(['"]deck-stage['"]\)/,
    );
    expect(out).toContain("stage.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')'");
  });

  it("preserves deck CSS inside closed body style tags", () => {
    const html = `<!doctype html><html><head><title>Deck</title></head><body><style>
.s-cover { background: var(--navy); }
.eyebrow { color: var(--accent); }
</style><div id="deck-stage"><section class="slide active s-cover">A</section></div></body></html>`;
    const out = stripArtifactPreviewBodyTextLeaks(html);
    expect(out).toContain(".s-cover { background: var(--navy); }");
    expect(out).toContain(".eyebrow { color: var(--accent); }");
  });

  it("does not strip inside an unclosed trailing script while streaming", () => {
    const streaming = `<!doctype html><html><body><script>
(function () {
  var stage = document.getElementById('deck-stage');
  function fit() { stage.style.transform = 'scale(1)'; }`;
    const out = stripArtifactPreviewBodyTextLeaks(streaming);
    expect(out).toContain("(function () {");
    expect(out).toContain("document.getElementById('deck-stage')");
  });

  it("restores persisted deck-framework scripts missing the IIFE prefix", () => {
    const mangled = `<!doctype html><html><body><div id="deck-stage"></div><script>
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  function fit() { stage.style.transform = 'translate(0px,0px) scale(1)'; }
  fit();
})();</script></body></html>`;
    const out = repairMangledDeckFrameworkScript(mangled);
    expect(out).toMatch(
      /<script>\s*\(function\s*\(\)\s*\{\s*var\s+stage\s*=\s*document\.getElementById\(['"]deck-stage['"]\)/,
    );
    const once = repairMangledDeckFrameworkScript(out);
    expect(once).toBe(out);
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

  it("detects truncated font tails left inside <head> after tag strip", () => {
    const leaked = `<!doctype html><html><head>
googleapis.com/css2?family=Newsreader&display=swap" />
<title>Deck</title>
</head><body><section class="slide active">A</section></body></html>`;
    expect(hasArtifactPreviewBodyTextLeaks(leaked)).toBe(true);
    expect(isArtifactHtmlStableForPreview(leaked)).toBe(false);
    const out = repairArtifactDocumentHead(leaked);
    expect(out).not.toMatch(/googleapis\.com/i);
    expect(out).toContain('<section class="slide active">A</section>');
    expect(isArtifactHtmlStableForPreview(out)).toBe(true);
  });

  it("strips short googleapis.com void tails without css2 path", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
googleapis.com" />
<section class="slide active">A</section>
</body></html>`;
    expect(hasArtifactPreviewBodyTextLeaks(leaked)).toBe(true);
    const out = stripArtifactPreviewBodyTextLeaks(leaked);
    expect(out).not.toMatch(/googleapis\.com/i);
    expect(out).toContain('<section class="slide active">A</section>');
  });

  it("strips mid-head orphan CDN tails without mutilating intact font links", () => {
    const leaked = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Newsreader&display=swap" rel="stylesheet" />
googleapis.com" />
<title>Deck</title>
</head><body><section class="slide active">A</section></body></html>`;
    const out = repairArtifactDocumentHead(leaked);
    expect(out).toContain('href="https://fonts.googleapis.com/css2?family=Newsreader&display=swap"');
    expect(out).not.toMatch(/<\/link>[\s\S]*googleapis\.com"\s*\/>/i);
    expect(out.replace(/<link\b[^>]*>/gi, "")).not.toMatch(/googleapis\.com"\s*\/>/i);
    expect(isArtifactHtmlStableForPreview(out)).toBe(true);
  });

  it("detects and strips truncated Google Fonts link tails from body", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
googleapis.com/css2?family=Newsreader:ital,wght@0,400;1,300&display=swap" />
<section class="slide active">A</section>
</body></html>`;
    expect(hasArtifactPreviewBodyTextLeaks(leaked)).toBe(true);
    expect(isArtifactHtmlStableForPreview(leaked)).toBe(false);
    const out = stripArtifactPreviewBodyTextLeaks(leaked);
    expect(out).not.toMatch(/googleapis\.com/i);
    expect(out).toContain('<section class="slide active">A</section>');
  });

  it("strips bunny/typekit/fontshare and jsdelivr script tails from body", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
fonts.bunny.net/css?family=Inter" />
use.typekit.net/abc1def.css" />
cdn.jsdelivr.net/npm/chart.js@4"></script>
<section class="slide active">A</section>
</body></html>`;
    expect(hasArtifactPreviewBodyTextLeaks(leaked)).toBe(true);
    const out = stripArtifactPreviewBodyTextLeaks(leaked);
    expect(out).not.toMatch(/bunny\.net|typekit|jsdelivr/i);
    expect(out).toContain('<section class="slide active">A</section>');
  });

  it("strips leaked external CDN <script src> tags from body", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<section class="slide active">A</section>
</body></html>`;
    const out = stripArtifactPreviewBodyTextLeaks(leaked);
    expect(out).not.toMatch(/<script[^>]*jsdelivr/i);
    expect(out).toContain('<section class="slide active">A</section>');
  });

  it("repairs head/body when only a fonts.googleapis.com void-tag tail remains", () => {
    const leaked = `<!doctype html><html><head>
fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600&display=swap" rel="stylesheet" />
<title>Deck</title></head><body>
rel="stylesheet" />
<div class="deck-shell"><section class="slide active">OK</section></div>
</body></html>`;
    const out = repairArtifactDocumentHead(leaked);
    expect(out).not.toMatch(/googleapis\.com/i);
    expect(out).not.toMatch(/rel="stylesheet"\s*\/>/);
    expect(out).toContain('<section class="slide active">OK</section>');
    expect(out).toContain('<meta name="viewport"');
    expect(hasArtifactPreviewBodyTextLeaks(out)).toBe(false);
    expect(isArtifactHtmlStableForPreview(out)).toBe(true);
  });

  it("blocks stability when body is only orphan CDN/link debris", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
cdn.jsdelivr.net/npm/foo@1/bar.css" />
</body></html>`;
    expect(hasArtifactPreviewBodyTextLeaks(leaked)).toBe(true);
    expect(isArtifactHtmlStableForPreview(leaked)).toBe(false);
  });

  it("strips leaked head <link stylesheet> tags from body", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap" />
<section class="slide active">A</section>
</body></html>`;
    const out = stripArtifactPreviewBodyTextLeaks(leaked);
    expect(out).not.toMatch(/<link[^>]*stylesheet/i);
    expect(out).toContain('<section class="slide active">A</section>');
  });

  it("preserves intact Google Fonts <link> tags inside <head>", () => {
    const html = `<!doctype html><html><head>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Newsreader&display=swap" rel="stylesheet" />
<title>Deck</title></head><body><section class="slide active">A</section></body></html>`;
    const out = repairArtifactDocumentHead(html);
    expect(out).toContain('href="https://fonts.googleapis.com/css2?family=Newsreader&display=swap"');
    expect(out).toContain('rel="preconnect"');
    expect(hasArtifactPreviewBodyTextLeaks(out)).toBe(false);
  });

  it("ships shared DOM leak guard/strip scripts for preview and export", () => {
    const guard = buildArtifactPreviewDomLeakGuardScript();
    const strip = buildArtifactPreviewDomLeakStripScript();
    expect(guard).toContain("isLeakedMetaElement");
    expect(guard).toContain("orphanHeadVoidLeak");
    expect(guard).toContain("isLeakedLinkElement");
    expect(guard).toContain("MutationObserver");
    expect(strip).toContain("stripLeakedNodes(document.body)");
    expect(strip).not.toContain("MutationObserver");
  });

  it("strips leaked meta viewport tags from body inner HTML", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<section class="slide active">A</section>
</body></html>`;
    const out = stripArtifactPreviewBodyTextLeaks(leaked);
    expect(out).not.toMatch(/<meta[^>]*name=["']viewport["']/i);
    expect(out).toContain('<section class="slide active">A</section>');
  });

  it("strips bare deck title text before deck-shell", () => {
    const leaked = `<!doctype html><html><head><title>Deck</title></head><body>
기업 AI 도입 효과 — 2024
<div class="deck-shell"><div id="deck-stage"><section class="slide active">A</section></div></div>
</body></html>`;
    const out = stripArtifactPreviewBodyTextLeaks(leaked);
    expect(out).not.toMatch(/기업 AI 도입 효과/);
    expect(out).toContain('<div class="deck-shell">');
    expect(out).toContain('<section class="slide active">A</section>');
  });

  it("strips orphan title elements before deck-shell", () => {
    const leaked = `<!doctype html><html><head><title>Deck</title></head><body>
<p>기업 AI 도입 효과 — 2024</p>
<div class="deck-shell"><div id="deck-stage"><section class="slide active">A</section></div></div>
</body></html>`;
    const out = stripDeckOrphansBeforeRootFromBodyInner(
      leaked.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "",
    );
    expect(out).not.toMatch(/기업 AI 도입 효과/);
    expect(out).toContain('<div class="deck-shell">');
  });

  it("preserves slide text inside deck-shell while stripping top-level leaks", () => {
    const html = `<!doctype html><html><body>
<div class="deck-shell"><div id="deck-stage"><section class="slide active"><h1>AI 도입 효과</h1></section></div></div>
</body></html>`;
    const out = stripArtifactPreviewBodyTextLeaks(html);
    expect(out).toContain('<h1>AI 도입 효과</h1>');
  });

  it("preserves non-deck top-level divs when no deck root is present", () => {
    const html = `<!doctype html><html><body><div data-screen-label="cta">CTA</div></body></html>`;
    const out = stripArtifactPreviewBodyTextLeaks(html);
    expect(out).toContain('<div data-screen-label="cta">CTA</div>');
  });

  it("ships deck loose page flow scrubbers in preview guard and export strip", () => {
    const guard = buildArtifactPreviewDomLeakGuardScript();
    const strip = buildArtifactPreviewDomLeakStripScript();
    expect(guard).toContain("stripDeckLoosePageFlow");
    expect(guard).toContain("stripOrphanDeckTitleSiblingsBeforeRoot");
    expect(strip).toContain("stripDeckBodyLooseFlow");
  });
});
