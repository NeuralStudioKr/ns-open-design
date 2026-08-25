import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 20 — Hangul-glued CSS declarations / SCSS vars / Tailwind arbitrary
 * / JS leftovers. Status glued to `document.` must keep the Hangul prefix.
 */
describe("chat leak probe round 20 (hangul css decl / js prefix)", () => {
  it("cuts Hangul glued to stacked CSS declarations and SCSS vars", () => {
    expect(
      sanitizeAssistantProseForDisplay(
        `슬라이드 추가 중mix-blend-mode: multiply; isolation: isolate;`,
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(
        `슬라이드 추가 중offset-path: path('M0 0'); offset-distance: 40%;`,
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중anchor-name: --dot; position-anchor: --dot;`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중$ink: #2d2a26;`, { stripCodeFences: true }),
    ).toBe("슬라이드 추가 중");
  });

  it("cuts Hangul glued to Tailwind arbitrary and JS leftovers without dropping status", () => {
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중bg-[#F5F0E6] w-[1920px]`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중document.querySelector('.slide')`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nquerySelector('.slide')`, { stripCodeFences: true }),
    ).toBe("진행.");
  });

  it("keeps markdown, streaming prefixes, and Hangul prose", () => {
    expect(
      sanitizeAssistantProseForDisplay("요약.\n# 다음 단계\n- 차트 추가", {
        stripCodeFences: true,
      }),
    ).toBe("요약.\n# 다음 단계\n- 차트 추가");
    expect(sanitizeAssistantProseForDisplay("Text <p", { stripCodeFences: true })).toBe("Text <p");
    expect(
      sanitizeAssistantProseForDisplay("슬라이드 추가 중\n차트 축 라벨을 확인하세요", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중\n차트 축 라벨을 확인하세요");
    expect(
      sanitizeAssistantProseForDisplay("슬라이드를 추가 중입니다 font-size 조정이 필요합니다", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드를 추가 중입니다 font-size 조정이 필요합니다");
  });

  it("keeps a closed question-form", () => {
    const out = sanitizeAssistantProseForDisplay(
      `질문\n<question-form id="discovery">{"questions":[{"id":"1"}]}</question-form>`,
      { stripCodeFences: true },
    );
    expect(out).toContain("<question-form");
    expect(out).toContain("질문");
  });
});
