import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 60 — pitch/editorial suffix chrome, @annotation family scrub,
 * position-area/mask/text-box flow copy.
 */
describe("chat leak / persist probe round 60 (PORTFOLIO · @annotation · position-area)", () => {
  it("drops PORTFOLIO/TEASER/PITCH leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("BARPORTFOLIO 1 · PORTFOLIO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXTEASER 1 · TEASER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPTRAILER 1 · TRAILER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOPITCH 1 · PITCH")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARMANIFESTO 1 · MANIFESTO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZPROLOGUE 1 · PROLOGUE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXEPILOGUE 1 · EPILOGUE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPPREFACE 1 · PREFACE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOTAGLINE 1 · TAGLINE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARHEADLINE 1 · HEADLINE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZSUBTITLE 1 · SUBTITLE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOSPLASH 1 · SPLASH")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARLANDING 1 · LANDING")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZONBOARDING 1 · ONBOARDING")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXWALKTHROUGH 1 · WALKTHROUGH")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPTUTORIAL 1 · TUTORIAL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOGUIDE 1 · GUIDE")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOPITCH 1 · PITCH\n피치 완료", {
        stripCodeFences: true,
      }),
    ).toBe("피치 완료");
  });

  it("scrubs @annotation/@namespace/@color-profile dumps", () => {
    expect(looksLikeDeckCodeDebrisLine("@annotation { }")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@namespace url(http://www.w3.org/1999/xhtml);")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@color-profile --swop {src:url(x.icc)}")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@font-feature-values Font One { @styleset { nice:1 } }")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@document url(https://example.com) { body{color:red} }")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@nest .parent { & .child { color: blue } }")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("완료됨.\n@annotation { }", {
        stripCodeFences: true,
      }),
    ).toBe("완료됨.");
    expect(
      sanitizeAssistantProseForDisplay("진행.\n@namespace url(http://www.w3.org/1999/xhtml);", {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("FOOPITCH 구성을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("FOOPITCH 구성을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("PITCH 값을 줄임")).toBe(false);
  });

  it("copies position-area/mask/text-box into slide flow", () => {
    const html = [
      '<section class="slide" style="position-area:top;overlay:auto;position-try:flip-block;position-try-fallbacks:flip-inline;position-visibility:anchors-visible;mask-size:cover;mask-position:center;mask-repeat:no-repeat;mask-mode:alpha;mask-clip:border-box;mask-origin:padding-box;mask-composite:add;text-box-trim:trim-both;text-box-edge:cap alphabetic;text-spacing-trim:trim-start;initial-letter:3;hyphenate-character:\\"-\\";hyphenate-limit-chars:auto;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/position-area:\s*top/i);
    expect(flowOpen).toMatch(/overlay:\s*auto/i);
    expect(flowOpen).toMatch(/position-try:\s*flip-block/i);
    expect(flowOpen).toMatch(/position-try-fallbacks:\s*flip-inline/i);
    expect(flowOpen).toMatch(/position-visibility:\s*anchors-visible/i);
    expect(flowOpen).toMatch(/mask-size:\s*cover/i);
    expect(flowOpen).toMatch(/mask-position:\s*center/i);
    expect(flowOpen).toMatch(/mask-repeat:\s*no-repeat/i);
    expect(flowOpen).toMatch(/mask-mode:\s*alpha/i);
    expect(flowOpen).toMatch(/text-box-trim:\s*trim-both/i);
    expect(flowOpen).toMatch(/text-box-edge:\s*cap alphabetic/i);
    expect(flowOpen).toMatch(/text-spacing-trim:\s*trim-start/i);
    expect(flowOpen).toMatch(/initial-letter:\s*3/i);
    expect(flowOpen).toMatch(/hyphenate-character:/i);
  });
});
