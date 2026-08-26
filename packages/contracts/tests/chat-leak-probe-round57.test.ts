import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 57 — GALLERY/STEPPER/COMMENT suffix chrome, @scroll-timeline /
 * @position-try scrub, and padding-block/list-style flow copy.
 */
describe("chat leak / persist probe round 57 (GALLERY · @scroll-timeline · padding-block)", () => {
  it("drops GALLERY/STEPPER/COMMENT/LAYOUT leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOGALLERY 1 · GALLERY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARCAROUSEL 1 · CAROUSEL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZACCORDION 1 · ACCORDION")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXSTEPPER 1 · STEPPER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPPAGINATION 1 · PAGINATION")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOBREADCRUMB 1 · BREADCRUMB")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXLAYOUT 1 · LAYOUT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPCOLUMN 1 · COLUMN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOROW 1 · ROW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOONUMBER 1 · NUMBER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPSPRITE 1 · SPRITE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOCOMMENT 1 · COMMENT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPREPLY 1 · REPLY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXTHREAD 1 · THREAD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZFEEDBACK 1 · FEEDBACK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOORATING 1 · RATING")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZTESTIMONIAL 1 · TESTIMONIAL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXWORDMARK 1 · WORDMARK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOMILESTONE 1 · MILESTONE")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOGALLERY 1 · GALLERY\n갤러리", {
        stripCodeFences: true,
      }),
    ).toBe("갤러리");
  });

  it("scrubs @scroll-timeline / @position-try / @function after Hangul status", () => {
    expect(looksLikeDeckCodeDebrisLine("@scroll-timeline --t {")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@view-timeline --v {")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@position-try --fallback {")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@function --double(--n) {")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@counter-style thumbs {")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@starting-style {")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("초안.\n@scroll-timeline --t {", {
        stripCodeFences: true,
      }),
    ).toBe("초안.");
    expect(
      sanitizeAssistantProseForDisplay("요약.\n@view-timeline --v {", {
        stripCodeFences: true,
      }),
    ).toBe("요약.");
    expect(
      sanitizeAssistantProseForDisplay("완료됨.\n@position-try --fallback {", {
        stripCodeFences: true,
      }),
    ).toBe("완료됨.");
    expect(
      sanitizeAssistantProseForDisplay("완료.\n@function --double(--n) {", {
        stripCodeFences: true,
      }),
    ).toBe("완료.");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("FOOGALLERY 레이아웃을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("FOOGALLERY 레이아웃을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("QUXLAYOUT 값을 줄임")).toBe(false);
  });

  it("copies padding-block/list-style into slide flow", () => {
    const html = [
      '<section class="slide" style="padding-block:24px;padding-inline:16px;padding-block-start:8px;list-style:disc outside;list-style-type:square;border-spacing:4px;table-layout:fixed;caption-side:bottom;empty-cells:hide;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/padding-block:\s*24px/i);
    expect(flowOpen).toMatch(/padding-inline:\s*16px/i);
    expect(flowOpen).toMatch(/padding-block-start:\s*8px/i);
    expect(flowOpen).toMatch(/list-style:\s*disc outside/i);
    expect(flowOpen).toMatch(/list-style-type:\s*square/i);
    expect(flowOpen).toMatch(/border-spacing:\s*4px/i);
    expect(flowOpen).toMatch(/table-layout:\s*fixed/i);
    expect(flowOpen).toMatch(/caption-side:\s*bottom/i);
    expect(flowOpen).toMatch(/empty-cells:\s*hide/i);
  });
});
