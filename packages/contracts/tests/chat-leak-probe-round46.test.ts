import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

/**
 * Round 46 — chart axis / KPI strip / comparison / magnifier chrome leftovers.
 */
describe("chat leak / persist probe round 46 (AXIS · KPISTRIP · SPLITVIEW)", () => {
  it("drops axis / plot / series chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("AXIS 1 · X")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PLOT 1 · AREA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SERIES 1 · DATA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CATEGORY 1 · BIN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DOMAIN 1 · X")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("RANGEAXIS 1 · Y")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TICK 1 · MARK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GRIDMINOR 1 · LINE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("REFLINE 1 · Y")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("THRESHOLD 1 · LINE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DATALABEL 1 · TXT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LEGENDKEY 1 · KEY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TIMELINEAXIS 1 · X")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("AXIS 1 · X\n축 라벨", {
        stripCodeFences: true,
      }),
    ).toBe("축 라벨");
  });

  it("drops KPI / comparison / magnifier chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("KPISTRIP 1 · ROW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("STATCARD 1 · CARD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("METRICROW 1 · ROW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("COMPARISON 1 · VS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BEFOREAFTER 1 · VS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SPLITVIEW 1 · PANE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MAGNIFIER 1 · ZOOM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LOUPE 1 · ZOOM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CALLOUTPIN 1 · PIN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WAYPOINT 1 · MAP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BREADCRUMBTRAIL 1 · PATH")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DELTA 1 · CHANGE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("VARIANCE 1 · GAP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAND 1 · ZONE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PLACEHOLDERTEXT 1 · HINT")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("KPISTRIP 1 · ROW\n지표 줄", {
        stripCodeFences: true,
      }),
    ).toBe("지표 줄");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("AXIS 범위를 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("AXIS 범위를 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("DELTA 값을 줄임")).toBe(false);
  });
});
