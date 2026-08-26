import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

/**
 * Round 64 — generic ALLCAPS track chrome (`FOOXYZ 1 · XYZ`) without a known
 * suffix dictionary entry.
 */
describe("chat leak / persist probe round 64 (generic ALLCAPS track)", () => {
  it("drops unknown FOOXYZ-style leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 · XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARABC 1 · ABC")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUZNOVELTOKEN 2 · NOVELTOKEN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZZZUNKNOWN A · UNKNOWN")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 · XYZ\n트랙 정리 완료", {
        stripCodeFences: true,
      }),
    ).toBe("트랙 정리 완료");
    expect(
      sanitizeAssistantProseForDisplay("BARABC 1 · ABC\n진행 중입니다", {
        stripCodeFences: true,
      }),
    ).toBe("진행 중입니다");
  });

  it("keeps Hangul prose and mixed-case copy", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 구성을 먼저 확인하세요.")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 구성을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("FOOXYZ 구성을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("Api 1 · Guide")).toBe(false);
    expect(looksLikeDeckCodeDebrisLine("XYZ 값을 줄임")).toBe(false);
  });
});
