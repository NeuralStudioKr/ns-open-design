import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

/**
 * Round 28 — generalize short track/index chrome beyond INTRO/CHECKLIST
 * (`WD · OUTRO`, `02 / AGENDA`, `SLIDE 03 · COVER`).
 */
describe("chat leak probe round 28 (generalized short track / index chrome)", () => {
  it("drops WD · OUTRO and SLIDE N · COVER chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("WD · OUTRO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SLIDE 03 · COVER")).toBe(true);
    expect(sanitizeAssistantProseForDisplay("WD · OUTRO", { stripCodeFences: true })).toBe("");
    expect(
      sanitizeAssistantProseForDisplay("SLIDE 03 · COVER", { stripCodeFences: true }),
    ).toBe("");
    expect(
      sanitizeAssistantProseForDisplay("완료됨.WD · OUTRO", { stripCodeFences: true }),
    ).toBe("완료됨.");
  });

  it("drops generalized NN / LABEL index-badge lines", () => {
    expect(looksLikeDeckCodeDebrisLine("02 / AGENDA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("05 / CHECKLIST")).toBe(true);
    expect(sanitizeAssistantProseForDisplay("02 / AGENDA", { stripCodeFences: true })).toBe("");
    expect(
      sanitizeAssistantProseForDisplay("슬라이드 추가 중\n02 / AGENDA", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중");
  });

  it("keeps real Hangul prose and question-form", () => {
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
