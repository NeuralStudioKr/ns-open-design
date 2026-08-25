import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

/**
 * Round 35 — HOOK/SCREEN/GOAL/TASK leftover chrome after round34 QUOTE/FAQ.
 */
describe("chat leak / persist probe round 35 (HOOK/SCREEN · GOAL/TASK)", () => {
  it("drops HOOK / SCREEN / GOAL / TASK chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("HOOK 01 · OPEN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SCREEN 2 · HOME")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GOAL 1 · KPI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TASK 03 · TODO")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("HOOK 01 · OPEN\n초안이 준비됐습니다.", {
        stripCodeFences: true,
      }),
    ).toBe("초안이 준비됐습니다.");
  });

  it("drops CASE / WORKSHOP / DECK / MOTIF chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("CASE 1 · STUDY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WORKSHOP 2 · LAB")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DECK 01 · COVER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MOTIF 1 · MARK")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("DECK 01 · COVER\n표지", {
        stripCodeFences: true,
      }),
    ).toBe("표지");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("GOAL 문서를 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("GOAL 문서를 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("TASK 준비가 필요합니다")).toBe(false);
  });
});
