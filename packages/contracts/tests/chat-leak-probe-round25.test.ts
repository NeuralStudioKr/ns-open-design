import { describe, expect, it } from "vitest";
import {
  looksLikeSoftCssDeclarationLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

/**
 * Round 25 — soft-CSS false cut left `WD ·`; spaced Hangul+Latin COVER TRACK;
 * incomplete aside/body/p openers; status+period glue (`완료됨.TRACK…`).
 * Round 24 covered body>/section>/doctype leftover shapes.
 */
describe("chat leak probe round 25 (WD · / spaced Hangul / incomplete openers)", () => {
  it("does not treat LECTURE 01 slide chrome as soft CSS", () => {
    expect(looksLikeSoftCssDeclarationLine(
      "LECTURE 01 · FRONT-END TRACKresponsive UI video svg SEO",
    )).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay(
        "WD · LECTURE 01 · FRONT-END TRACKresponsive UI video svg SEO",
        { stripCodeFences: true },
      ),
    ).toBe("");
  });

  it("drops spaced Hangul+Latin COVER TRACK dumps", () => {
    expect(
      sanitizeAssistantProseForDisplay(
        "COVER TRACK 반응형 UI · video · svg SEO 유리합니다",
        { stripCodeFences: true },
      ),
    ).toBe("");
    expect(
      sanitizeAssistantProseForDisplay(
        "TRACK반응형 UIvideo·svg SEO 유리 초기 비용 낮음",
        { stripCodeFences: true },
      ),
    ).toBe("");
  });

  it("cuts status+period glue before TRACK dump", () => {
    expect(
      sanitizeAssistantProseForDisplay("완료됨.TRACK반응형 UIvideo·svg SEO 유리", {
        stripCodeFences: true,
      }),
    ).toBe("완료됨.");
  });

  it("drops aside/body/p incomplete slide openers", () => {
    expect(
      sanitizeAssistantProseForDisplay(`aside class="slide">체크리스트 SEO 유리</artifact>`, {
        stripCodeFences: true,
      }),
    ).toBe("");
    expect(
      sanitizeAssistantProseForDisplay("body class=deck-slide>WD FRONT-END TRACK</artifact>", {
        stripCodeFences: true,
      }),
    ).toBe("");
    expect(
      sanitizeAssistantProseForDisplay("p class=slide-copy>반응형 UIvideo SEO</artifact>", {
        stripCodeFences: true,
      }),
    ).toBe("");
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
