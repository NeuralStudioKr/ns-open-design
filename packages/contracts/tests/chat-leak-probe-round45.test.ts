import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

/**
 * Round 45 — typography / chart / print / callout chrome leftovers.
 */
describe("chat leak / persist probe round 45 (SPARKLINE · DROPCAP · FUNNEL)", () => {
  it("drops typography track chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("BASELINE 1 · TYPE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LEADING 1 · TYPE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TRACKING 1 · TYPE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("KERNING 1 · TYPE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SERIF 1 · TYPE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SANS 1 · TYPE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MONO 1 · TYPE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PULLQUOTE 1 · QUOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DROPCAP 1 · LETTER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOLIO 1 · PAGE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("RUNNINGHEAD 1 · HEAD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("RUNNINGFOOT 1 · FOOT")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("DROPCAP 1 · LETTER\n드롭캡", {
        stripCodeFences: true,
      }),
    ).toBe("드롭캡");
  });

  it("drops chart / funnel / gauge chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("SPARKLINE 1 · CHART")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GAUGE 1 · METER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("RADAR 1 · CHART")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BUBBLE 1 · CHART")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SCATTER 1 · CHART")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HISTOGRAM 1 · BIN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HEATMAP 1 · GRID")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TREEMAP 1 · TILE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SANKEY 1 · FLOW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WATERFALL 1 · CHART")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FUNNEL 1 · STEP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LEADERBOARD 1 · RANK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BOXPLOT 1 · STAT")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("SPARKLINE 1 · CHART\n스파크라인", {
        stripCodeFences: true,
      }),
    ).toBe("스파크라인");
  });

  it("drops print / glossary / callout chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("COLOPHON 1 · NOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ERRATA 1 · NOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ADDENDUM 1 · NOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ANNEX 1 · NOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GLOSSARY 1 · TERM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CHEATSHEET 1 · SHEET")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HANDOUT 1 · SHEET")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WORKSHEET 1 · SHEET")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("RUBRIC 1 · GRID")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CALLOUTBOX 1 · NOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SPEECHBUBBLE 1 · SAY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("THOUGHTBUBBLE 1 · THINK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ARROW 1 · POINT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CHEVRON 1 · POINT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HOTSPOT 1 · HIT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CROSSHAIR 1 · AIM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GUIDE 1 · LINE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("RULER 1 · MARK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GRIDSNAP 1 · ALIGN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GRIDLINE 1 · ROW")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("GLOSSARY 1 · TERM\n용어집", {
        stripCodeFences: true,
      }),
    ).toBe("용어집");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("FUNNEL 지표를 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("FUNNEL 지표를 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("TARGET 값을 줄임")).toBe(false);
  });
});
