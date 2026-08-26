import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 56 — WEEK/CHAPTER curriculum suffix chrome, @font-palette-values
 * scrub, and font/text-align flow copy.
 */
describe("chat leak / persist probe round 56 (WEEK/CHAPTER · font-palette · font)", () => {
  it("drops WEEK/CHAPTER/SLIDE/FINALE curriculum leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOWEEK 1 · WEEK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARDAY 1 · DAY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZSESSION 1 · SESSION")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXEPISODE 1 · EPISODE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPCHAPTER 1 · CHAPTER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOPART 1 · PART")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARUNIT 1 · UNIT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZMODULE 1 · MODULE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXLECTURE 1 · LECTURE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOSLIDE 1 · SLIDE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARPAGE 1 · PAGE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZSEC 1 · SEC")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARFINALE 1 · FINALE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZOPENING 1 · OPENING")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXCLOSING 1 · CLOSING")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOKEYTAKE 1 · KEYTAKE")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("ZAPCHAPTER 1 · CHAPTER\n챕터", {
        stripCodeFences: true,
      }),
    ).toBe("챕터");
  });

  it("scrubs @font-palette-values after Hangul status", () => {
    expect(looksLikeDeckCodeDebrisLine("@font-palette-values --p {")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("완료.\n@font-palette-values --p {", {
        stripCodeFences: true,
      }),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay(
        "완료.\n@font-palette-values --brand {\n  font-family: Test;\n}",
        { stripCodeFences: true },
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("진행.\n@property --accent {", {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("ZAPCHAPTER 구성을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("ZAPCHAPTER 구성을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("FOOWEEK 값을 줄임")).toBe(false);
  });

  it("copies font/text-align/color into slide flow", () => {
    const html = [
      '<section class="slide" style="font:600 18px/1.4 system-ui;font-family:Georgia,serif;font-size:20px;line-height:1.5;letter-spacing:0.02em;text-align:center;text-wrap:balance;white-space:pre-wrap;hyphens:auto;color:#222;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/font:\s*600 18px\/1\.4 system-ui/i);
    expect(flowOpen).toMatch(/font-family:\s*Georgia,serif/i);
    expect(flowOpen).toMatch(/font-size:\s*20px/i);
    expect(flowOpen).toMatch(/line-height:\s*1\.5/i);
    expect(flowOpen).toMatch(/letter-spacing:\s*0\.02em/i);
    expect(flowOpen).toMatch(/text-align:\s*center/i);
    expect(flowOpen).toMatch(/text-wrap:\s*balance/i);
    expect(flowOpen).toMatch(/white-space:\s*pre-wrap/i);
    expect(flowOpen).toMatch(/hyphens:\s*auto/i);
    expect(flowOpen).toMatch(/color:\s*#222/i);
  });
});
