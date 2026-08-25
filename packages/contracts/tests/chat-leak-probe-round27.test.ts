import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

/**
 * Round 27 — short track chrome leftovers without a long slide body
 * (`WD · INTRO`, `WD · TRACK`, `01 / CHECKLIST` badge lines).
 */
describe("chat leak probe round 27 (short WD · INTRO / index badge chrome)", () => {
  it("drops short WD · INTRO/TRACK chrome lines", () => {
    expect(looksLikeDeckCodeDebrisLine("WD · INTRO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WD · TRACK")).toBe(true);
    expect(sanitizeAssistantProseForDisplay("WD · INTRO", { stripCodeFences: true })).toBe("");
    expect(sanitizeAssistantProseForDisplay("WD · TRACK", { stripCodeFences: true })).toBe("");
    expect(
      sanitizeAssistantProseForDisplay("INTRO · FRONT-END", { stripCodeFences: true }),
    ).toBe("");
    expect(
      sanitizeAssistantProseForDisplay("슬라이드 작업이 완료되었습니다.\nWD · INTRO", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 작업이 완료되었습니다.");
  });

  it("drops index-badge chrome lines in chat", () => {
    expect(looksLikeDeckCodeDebrisLine("01 / INTRO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("05 / CHECKLIST")).toBe(true);
    expect(sanitizeAssistantProseForDisplay("05 / CHECKLIST", { stripCodeFences: true })).toBe("");
    expect(sanitizeAssistantProseForDisplay("06 / SUMMARY", { stripCodeFences: true })).toBe("");
  });

  it("keeps markdown and question-form", () => {
    expect(
      sanitizeAssistantProseForDisplay("요약.\n# 다음 단계\n- 차트 추가", {
        stripCodeFences: true,
      }),
    ).toBe("요약.\n# 다음 단계\n- 차트 추가");
    const out = sanitizeAssistantProseForDisplay(
      `질문\n<question-form id="discovery">{"questions":[{"id":"1"}]}</question-form>`,
      { stripCodeFences: true },
    );
    expect(out).toContain("<question-form");
    expect(out).toContain("질문");
  });
});
