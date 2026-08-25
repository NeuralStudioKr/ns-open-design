import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 18 — Hangul-glued at-rules / keyframes / filter functions, plus
 * `image()` / `element(#)` / `anchor()` / `color()` leftovers.
 */
describe("chat leak probe round 18 (hangul @import / keyframes / css color fn)", () => {
  it("cuts Hangul glued to @import even after the url is stripped", () => {
    expect(
      sanitizeAssistantProseForDisplay(
        `슬라이드 추가 중@import url('https://fonts.googleapis.com/css2?family=Caveat');`,
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중@import`, { stripCodeFences: true }),
    ).toBe("슬라이드 추가 중");
  });

  it("cuts Hangul glued to keyframe selectors and filter functions", () => {
    expect(
      sanitizeAssistantProseForDisplay(
        `슬라이드 추가 중from { transform: rotate(0deg); opacity: 0 }`,
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(
        `슬라이드 추가 중0% { opacity: 0; transform: translateY(12px) }`,
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중blur(12px) saturate(1.1);`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중");
  });

  it("drops image/element/anchor/color() leftovers", () => {
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nimage(ltr 'hero.jpg');`, { stripCodeFences: true }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nelement(#slide-1);`, { stripCodeFences: true }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nanchor(--dot top);`, { stripCodeFences: true }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\ncolor(display-p3 0.9 0.2 0.2);`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
  });

  it("keeps markdown, streaming prefixes, and Hangul prose", () => {
    expect(
      sanitizeAssistantProseForDisplay("요약.\n# 다음 단계\n- 차트 추가", {
        stripCodeFences: true,
      }),
    ).toBe("요약.\n# 다음 단계\n- 차트 추가");
    expect(sanitizeAssistantProseForDisplay("Text <p", { stripCodeFences: true })).toBe(
      "Text <p",
    );
    expect(
      sanitizeAssistantProseForDisplay("슬라이드 추가 중\n차트 축 라벨을 확인하세요", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중\n차트 축 라벨을 확인하세요");
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
