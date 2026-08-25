import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

/**
 * Round 29 — MiniMax leftover chrome that is not WD/SLIDE-prefixed:
 * PAGE/SEC track lines, bullet/hyphen separators, middle-dot index badges.
 */
describe("chat leak probe round 29 (PAGE/SEC chrome · middle-dot badges)", () => {
  it("drops PAGE/SEC/LECTURE track chrome and bullet/hyphen WD leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("PAGE 01 · COVER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SEC 02 · AGENDA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LECTURE · 01")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WD • OUTRO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WD - INTRO")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("완료됨.\nPAGE 01 · COVER", { stripCodeFences: true }),
    ).toBe("완료됨.");
    expect(
      sanitizeAssistantProseForDisplay("슬라이드 추가 중\nSEC 02 · AGENDA", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중");
  });

  it("drops middle-dot and tight index-badge leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("05 · CHECKLIST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("05/CHECKLIST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("05 / 체크리스트")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("05 · CHECKLIST", { stripCodeFences: true }),
    ).toBe("");
  });

  it("keeps real Hangul status, markdown, and question-form", () => {
    expect(
      sanitizeAssistantProseForDisplay("슬라이드 추가 중\n차트 축 라벨을 확인하세요", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중\n차트 축 라벨을 확인하세요");
    expect(
      sanitizeAssistantProseForDisplay("font-size 조정이 필요합니다", {
        stripCodeFences: true,
      }),
    ).toBe("font-size 조정이 필요합니다");
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
