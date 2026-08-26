import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 58 — LABEL/CAPTION/AVATAR suffix chrome + float/break/orphans flow copy.
 */
describe("chat leak / persist probe round 58 (LABEL/AVATAR · float/break)", () => {
  it("drops LABEL/CAPTION/TAG/AVATAR/TABLEAU leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("ZAPLABEL 1 · LABEL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOCAPTION 1 · CAPTION")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARTAG 1 · TAG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOAVATAR 1 · AVATAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZTABLEAU 1 · TABLEAU")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOFIELDSET 1 · FIELDSET")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARLEGEND 1 · LEGEND")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZOUTPUT 1 · OUTPUT")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOAVATAR 1 · AVATAR\n아바타", {
        stripCodeFences: true,
      }),
    ).toBe("아바타");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("FOOAVATAR 이미지를 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("FOOAVATAR 이미지를 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("ZAPLABEL 값을 줄임")).toBe(false);
  });

  it("copies float/break/orphans/shape into slide flow", () => {
    const html = [
      '<section class="slide" style="float:left;clear:both;break-inside:avoid;break-before:column;orphans:3;widows:2;box-decoration-break:clone;shape-outside:circle();image-rendering:crisp-edges;content:normal;quotes:auto;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/float:\s*left/i);
    expect(flowOpen).toMatch(/clear:\s*both/i);
    expect(flowOpen).toMatch(/break-inside:\s*avoid/i);
    expect(flowOpen).toMatch(/break-before:\s*column/i);
    expect(flowOpen).toMatch(/orphans:\s*3/i);
    expect(flowOpen).toMatch(/widows:\s*2/i);
    expect(flowOpen).toMatch(/box-decoration-break:\s*clone/i);
    expect(flowOpen).toMatch(/shape-outside:\s*circle\(\)/i);
    expect(flowOpen).toMatch(/image-rendering:\s*crisp-edges/i);
    expect(flowOpen).toMatch(/content:\s*normal/i);
    expect(flowOpen).toMatch(/quotes:\s*auto/i);
  });
});
