import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 63 — workflow suffix chrome and scroll-marker/interactivity flow.
 */
describe("chat leak / persist probe round 63 (WIRE · SPRINT · interactivity)", () => {
  it("drops WIRE/SPRINT/USABILITY leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("QUXWIRE 1 · WIRE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPSKETCH 1 · SKETCH")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOCOMPS 1 · COMPS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARLOFI 1 · LOFI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZHIFI 1 · HIFI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXSPECS 1 · SPECS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPREQUIREMENTS 1 · REQUIREMENTS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOACCEPTANCE 1 · ACCEPTANCE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARCRITERIA 1 · CRITERIA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZBACKLOG 1 · BACKLOG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXSPRINT 1 · SPRINT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPEPIC 1 · EPIC")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARRETRO 1 · RETRO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZPOSTMORTEM 1 · POSTMORTEM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXRUNBOOK 1 · RUNBOOK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPPLAYTEST 1 · PLAYTEST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOUSABILITY 1 · USABILITY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARACCESSIBILITY 1 · ACCESSIBILITY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZA11Y 1 · A11Y")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXI18N 1 · I18N")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPL10N 1 · L10N")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOLOCALIZATION 1 · LOCALIZATION")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXDESIGNDOC 1 · DESIGNDOC")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOCHANGELOG 1 · CHANGELOG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARRELEASE 1 · RELEASE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZVERSION 1 · VERSION")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("QUXSPRINT 1 · SPRINT\n스프린트 완료", {
        stripCodeFences: true,
      }),
    ).toBe("스프린트 완료");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("QUXSPRINT 구성을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("QUXSPRINT 구성을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("SPRINT 값을 줄임")).toBe(false);
  });

  it("copies scroll-marker/interactivity into slide flow", () => {
    const html = [
      '<section class="slide" style="scroll-marker-group:after;interactivity:inert;interest-delay:200ms;dynamic-range-limit:standard;contrast-color:CanvasText;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/scroll-marker-group:\s*after/i);
    expect(flowOpen).toMatch(/interactivity:\s*inert/i);
    expect(flowOpen).toMatch(/interest-delay:\s*200ms/i);
    expect(flowOpen).toMatch(/dynamic-range-limit:\s*standard/i);
    expect(flowOpen).toMatch(/contrast-color:\s*CanvasText/i);
  });
});
