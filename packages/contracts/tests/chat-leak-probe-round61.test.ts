import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 61 — media/story suffix chrome and masonry/baseline flow copy.
 */
describe("chat leak / persist probe round 61 (REEL · STORY · masonry)", () => {
  it("drops REEL/STORY/PODCAST leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("BAZREEL 1 · REEL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXSHORTS 1 · SHORTS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPSTORIES 1 · STORIES")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOFEED 1 · FEED")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARSTREAM 1 · STREAM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZBROADCAST 1 · BROADCAST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXLIVE 1 · LIVE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPWEBINAR 1 · WEBINAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOPODCAST 1 · PODCAST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARNARRATIVE 1 · NARRATIVE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZSTORY 1 · STORY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXPLOT 1 · PLOT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPARC 1 · ARC")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARCODA 1 · CODA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZENCORE 1 · ENCORE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXBONUS 1 · BONUS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPEXTRAS 1 · EXTRAS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARFAQS 1 · FAQS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZQANDA 1 · QANDA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPLINKS 1 · LINKS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARBIBLIO 1 · BIBLIO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZCITATIONS 1 · CITATIONS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPTHANKS 1 · THANKS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXACK 1 · ACK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOREF 1 · REF")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("BAZSTORY 1 · STORY\n스토리보드 완료", {
        stripCodeFences: true,
      }),
    ).toBe("스토리보드 완료");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("BAZSTORY 구성을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("BAZSTORY 구성을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("STORY 값을 줄임")).toBe(false);
  });

  it("copies masonry/baseline into slide flow", () => {
    const html = [
      '<section class="slide" style="masonry-auto-flow:next;align-tracks:start;justify-tracks:stretch;max-lines:3;continue:overflow;baseline-source:first;dominant-baseline:middle;alignment-baseline:central;paint-order:stroke fill;vector-effect:non-scaling-stroke;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/masonry-auto-flow:\s*next/i);
    expect(flowOpen).toMatch(/align-tracks:\s*start/i);
    expect(flowOpen).toMatch(/justify-tracks:\s*stretch/i);
    expect(flowOpen).toMatch(/max-lines:\s*3/i);
    expect(flowOpen).toMatch(/continue:\s*overflow/i);
    expect(flowOpen).toMatch(/baseline-source:\s*first/i);
    expect(flowOpen).toMatch(/dominant-baseline:\s*middle/i);
    expect(flowOpen).toMatch(/alignment-baseline:\s*central/i);
    expect(flowOpen).toMatch(/paint-order:\s*stroke fill/i);
    expect(flowOpen).toMatch(/vector-effect:\s*non-scaling-stroke/i);
  });
});
