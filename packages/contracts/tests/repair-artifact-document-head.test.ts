import { describe, expect, it } from "vitest";

import { isArtifactHtmlStableForPreview } from "../src/html/isArtifactHtmlStableForPreview.js";
import {
  repairArtifactDocumentHead,
  stripIncompleteOpenTags,
  stripTrailingUnclosedRawBlocks,
} from "../src/html/repairArtifactDocumentHead.js";
import { DECK_SKELETON_HTML } from "../src/prompts/deck-framework.js";

const HERMES_CORRUPT = `<!doctype html>
<html lang="ko">
<head>device-width, initial-scale=1" />
  <title>Hermes</title>
</head>
<body><div class="slide">A</div></body>
</html>`;

describe("repairArtifactDocumentHead", () => {
  it("repairs truncated viewport meta immediately after <head>", () => {
    const out = repairArtifactDocumentHead(HERMES_CORRUPT);
    expect(out).not.toMatch(/<head>\s*device-width/i);
    expect(out).toContain('content="width=device-width, initial-scale=1"');
    expect(out).toContain("<meta charset");
    expect(out).toContain("<title>Hermes</title>");
  });

  it("is idempotent on valid documents", () => {
    const valid = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title></head><body></body></html>`;
    const once = repairArtifactDocumentHead(valid);
    const twice = repairArtifactDocumentHead(once);
    expect(twice).toBe(once);
  });

  it("strips viewport fragments leaked into body after a corrupted head", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
device-width, initial-scale=1" />
<div class="slide">A</div></body></html>`;
    const out = repairArtifactDocumentHead(leaked);
    expect(out).not.toMatch(/<body>\s*[\n\r]*\s*device-width/i);
    expect(out).toContain('<div class="slide">A</div>');
    expect(out).toContain('<meta name="viewport"');
  });

  it("strips viewport fragments leaked inside a deck wrapper", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body><div class="deck">
device-width, initial-scale=1" >
<section class="slide">A</section></div></body></html>`;
    const out = repairArtifactDocumentHead(leaked);
    expect(out).not.toMatch(/<div class="deck">\s*device-width/i);
    expect(out).toContain('<section class="slide">A</section>');
    expect(out).toContain('<meta name="viewport"');
  });

  it("repairs viewport=width=device-width corruption immediately after <head>", () => {
    const corrupt = `<!doctype html><html><head>viewport=width=device-width, initial-scale=1" />
  <title>Deck</title></head><body><section class="slide">A</section></body></html>`;
    const out = repairArtifactDocumentHead(corrupt);
    expect(out).not.toMatch(/<head[^>]*>\s*viewport=/i);
    expect(out).toContain('content="width=device-width, initial-scale=1"');
    expect(out).toContain('<section class="slide">A</section>');
  });

  it("strips viewport/meta fragments leaked inside a slide section", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
<section class="slide active">
viewport=width=device-width, initial-scale=1" />
<h1>Title</h1></section></body></html>`;
    const out = repairArtifactDocumentHead(leaked);
    expect(out).not.toMatch(/viewport=width=device-width/i);
    expect(out).toContain('<h1>Title</h1>');
  });

  it("strips name=viewport attribute fragments leaked into body", () => {
    const leaked = `<!doctype html><html><head><title>T</title></head><body>
name="viewport" content="width=device-width, initial-scale=1" />
<div class="slide">A</div></body></html>`;
    const out = repairArtifactDocumentHead(leaked);
    expect(out).not.toMatch(/<body>[\s\S]*name="viewport"/i);
    expect(out).toContain('<div class="slide">A</div>');
    expect(out).toContain('<meta name="viewport"');
  });

  it("preserves valid viewport meta while stripping leaked tails", () => {
    const html =
      '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title></head><body><div class="deck">device-width, initial-scale=1" /><section class="slide">A</section></div></body></html>';
    const out = repairArtifactDocumentHead(html);
    expect(out).toContain('content="width=device-width, initial-scale=1"');
    expect(out).not.toMatch(/<div class="deck">\s*device-width/i);
  });

  it("repairs and strips the shorter -width viewport suffix leak", () => {
    const corrupt = `<!doctype html><html><head>-width, initial-scale=1" />
  <title>Deck</title></head><body><div class="deck">-width, initial-scale=1" /><section class="slide">A</section></div></body></html>`;
    const out = repairArtifactDocumentHead(corrupt);
    expect(out).not.toMatch(/<head[^>]*>[\s\S]*?>\s*-width\s*,\s*initial-scale/i);
    expect(out).not.toMatch(/<div class="deck">\s*-width/i);
    expect(out).toContain('content="width=device-width, initial-scale=1"');
    expect(out).toContain('<section class="slide">A</section>');
  });

  it("preserves deck-framework navigation script through the full repair pipeline", () => {
    const out = repairArtifactDocumentHead(DECK_SKELETON_HTML);
    expect(out).toMatch(
      /<script>\s*\(function\s*\(\)\s*\{\s*var\s+stage\s*=\s*document\.getElementById\(['"]deck-stage['"]\)/,
    );
    expect(out).toContain("function fit()");
    expect(out).toContain("stage.style.transform");
  });

  it("restores mangled deck-framework scripts during head repair", () => {
    const mangled = `<!doctype html><html><head><title>Deck</title></head><body><script>
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  function fit() { stage.style.transform = 'translate(0px,0px) scale(1)'; }
  fit();
})();</script></body></html>`;
    const out = repairArtifactDocumentHead(mangled);
    expect(out).toMatch(
      /<script>\s*\(function\s*\(\)\s*\{\s*var\s+stage\s*=\s*document\.getElementById\(['"]deck-stage['"]\)/,
    );
  });

  it("preserves deck CSS inside head style tags while stripping body leaks", () => {
    const html = `<!doctype html><html><head><style>
/ ── Per-deck styles ── /
@import url('https://fonts.googleapis.com/css2');
:root { --bg: #FAFAFA; --accent: #2F6FEB; }
.s-cover { background: #0D1117; }
.slide-inner { flex: 1 1 auto; }
</style><title>Deck</title></head><body>
-width, initial-scale=1" />
<section class="slide active s-cover">A</section></body></html>`;
    const out = repairArtifactDocumentHead(html);
    expect(out).toContain("--bg: #FAFAFA");
    expect(out).toContain(".s-cover { background: #0D1117; }");
    expect(out).toContain("@import url('https://fonts.googleapis.com/css2')");
    expect(out).not.toMatch(/<body>\s*-width/i);
    expect(out).toContain('<section class="slide active s-cover">A</section>');
  });

  it("strips trailing unclosed script so salvaged decks become preview-stable", () => {
    // Model finishes all slides then end_turn mid-nav <script>. Salvage may
    // append </body></html> after the broken block — tag-balance still fails
    // until the unclosed script is dropped.
    const html = `<!doctype html><html lang="ko"><body style="margin:0">
<section class="slide" style="background:#0f172a"><h1>Cover</h1></section>
<section class="slide" style="background:#FAFAFA"><h2>Overview</h2></section>
<script>
(
  }
  document.addEventListener('keydown', e=>{
    if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' ') go(curX=0;
  document.addEventListener('touchstart', e=>startX=e.touches[0].clientX,
</body></html>`;

    expect(isArtifactHtmlStableForPreview(html)).toBe(false);
    const out = repairArtifactDocumentHead(html);
    expect(out).toContain('<section class="slide"');
    expect(out).toContain("Cover");
    expect(out).toContain("Overview");
    expect(out).not.toMatch(/<script\b/i);
    expect(out).not.toContain("ArrowRight");
    expect(out).toMatch(/<\/body>\s*<\/html>\s*$/i);
    expect(isArtifactHtmlStableForPreview(out)).toBe(true);
  });

  it("does not strip intact closed navigation scripts", () => {
    const html = `<!doctype html><html><head><title>T</title></head><body>
<section class="slide">A</section>
<script>
(function(){
  const slides=document.querySelectorAll('.slide');
  document.addEventListener('keydown',e=>{
    if(e.key==='ArrowRight'){/* next */}
  });
})();
</script>
</body></html>`;
    const out = repairArtifactDocumentHead(html);
    expect(out).toContain("<script>");
    expect(out).toContain("querySelectorAll('.slide')");
    expect(out).toContain("</script>");
    expect(isArtifactHtmlStableForPreview(out)).toBe(true);
  });

  it("stripTrailingUnclosedRawBlocks preserves mid-stream incompleteness without document closers", () => {
    const streaming = `<!doctype html><html><body><section class="slide">A</section>
<script>
(function(){ const slides=document.querySelectorAll('.slide');`;
    const out = stripTrailingUnclosedRawBlocks(streaming);
    expect(out).toContain('<section class="slide">A</section>');
    expect(out).not.toContain("<script>");
    expect(isArtifactHtmlStableForPreview(out)).toBe(false);
  });

  it("closes unclosed head style truncated before body so slides are kept", () => {
    const html = `<!doctype html><html><head><title>Deck</title>
<style>.slide{padding:40px
<body>
<section class="slide"><h1>기업 AI 도입 효과</h1><p>개요 설명입니다.</p></section>
</body></html>`;
    expect(isArtifactHtmlStableForPreview(html)).toBe(false);
    const out = repairArtifactDocumentHead(html);
    expect(out).toContain("기업 AI 도입 효과");
    expect(out).toContain("</style>");
    expect(out).toMatch(/<section class="slide"/);
    expect(isArtifactHtmlStableForPreview(out)).toBe(true);
  });

  it("clears dual trailing unclosed style+script after slides", () => {
    const html = `<!doctype html><html><body>
<section class="slide"><h1>Cover slide with enough copy</h1><p>Body text for salvage quality.</p></section>
<style>.a{
<script>var x=1
</body></html>`;
    expect(isArtifactHtmlStableForPreview(html)).toBe(false);
    const out = repairArtifactDocumentHead(html);
    expect(out).toContain("Cover slide");
    expect(out).not.toMatch(/<style\b/i);
    expect(out).not.toMatch(/<script\b/i);
    expect(isArtifactHtmlStableForPreview(out)).toBe(true);
  });

  it("strips stuttered incomplete section open that swallows the next slide tag", () => {
    // Agent cut mid-attribute then restarted: `<section class="\n<section class="slide"…>`
    const html = `<!doctype html>
<html lang="ko">
<body>
<section class="slide" style="background:#0a0a1a"><h1>Cover</h1></section>
<!-- 슬라이드 2 -->
<section class="
<section class="slide" style="background:#ffffff">
  <h2>NeuralStudio란?</h2>
  <div style="background:#f0f9ff;border-left:5px solid #0ea5e9">
    <h3>미션</h3>
    <p>AI 기술과 크리에이티브 역량을 결합합니다.</p>
  </div>
</section>
<section class="slide" style="background:#0f172a"><h2>핵심 서비스</h2></section>
</body>
</html>`;
    const out = repairArtifactDocumentHead(html);
    expect(out).not.toMatch(/<section class="\s*\n\s*<section/i);
    expect(out).toContain('<section class="slide" style="background:#ffffff">');
    expect(out).toContain("NeuralStudio란?");
    expect(out).toContain("미션");
    expect(out).toContain("핵심 서비스");
    // Exactly three real slide openers remain.
    expect(out.match(/<section\b[^>]*\bclass=["'][^"']*\bslide\b/gi)?.length).toBe(3);
  });

  it("stripIncompleteOpenTags keeps legitimate multiline tags and script comparisons", () => {
    const html = `<!doctype html><html><body>
<section
  class="slide"
  style="min-height:100vh">
  <h1>Ok</h1>
</section>
<script>
if (a < b) { window.__ok = true; }
</script>
</body></html>`;
    const out = stripIncompleteOpenTags(html);
    expect(out).toContain('class="slide"');
    expect(out).toContain("if (a < b)");
    expect(out).toContain("</script>");
  });
});
