import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 62 — design-system suffix chrome and animation-range/column-rule flow.
 */
describe("chat leak / persist probe round 62 (KEYVISUAL · TOKENS · animation-range)", () => {
  it("drops KEYVISUAL/TOKENS/THEME leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("BARKEYVISUAL 1 · KEYVISUAL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZKEYART 1 · KEYART")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXMOOD 1 · MOOD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPLOOK 1 · LOOK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOFEEL 1 · FEEL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARVIBE 1 · VIBE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZTHEME 1 · THEME")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXPALETTE 1 · PALETTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPTYPO 1 · TYPO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXTOKENS 1 · TOKENS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOSYSTEM 1 · SYSTEM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARFOUNDATION 1 · FOUNDATION")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZCOMPONENT 1 · COMPONENT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXPATTERN 1 · PATTERN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPTEMPLATE 1 · TEMPLATE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZMOCKUP 1 · MOCKUP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXPROTOTYPE 1 · PROTOTYPE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOMICROCOPY 1 · MICROCOPY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARUXCOPY 1 · UXCOPY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZVOICE 1 · VOICE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXTONE 1 · TONE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPMESSAGING 1 · MESSAGING")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("QUXTOKENS 1 · TOKENS\n토큰 정리 완료", {
        stripCodeFences: true,
      }),
    ).toBe("토큰 정리 완료");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("QUXTOKENS 구성을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("QUXTOKENS 구성을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("TOKENS 값을 줄임")).toBe(false);
  });

  it("copies animation-range/column-rule into slide flow", () => {
    const html = [
      '<section class="slide" style="animation-range:entry 0% exit 100%;animation-range-start:entry 10%;animation-range-end:exit 90%;view-timeline-inset:10%;scroll-timeline-attachment:local;column-rule-color:#ccc;column-rule-width:1px;column-rule-style:solid;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/animation-range:\s*entry 0% exit 100%/i);
    expect(flowOpen).toMatch(/animation-range-start:\s*entry 10%/i);
    expect(flowOpen).toMatch(/animation-range-end:\s*exit 90%/i);
    expect(flowOpen).toMatch(/view-timeline-inset:\s*10%/i);
    expect(flowOpen).toMatch(/scroll-timeline-attachment:\s*local/i);
    expect(flowOpen).toMatch(/column-rule-color:\s*#ccc/i);
    expect(flowOpen).toMatch(/column-rule-width:\s*1px/i);
    expect(flowOpen).toMatch(/column-rule-style:\s*solid/i);
  });
});
