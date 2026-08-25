import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 23 — Hangul-titled tag-stripped slide body without round21 fingerprints
 * (`LECTURE` / `axe-core` / `prefers-reduced-motion`), plus incomplete
 * `section class=slide>` openers.
 */
const HANGUL_TITLED_LEAK =
  "반응형 UIvideo·svg에일 HTML/CSS, 미디어 쿼리로 유동 재배치. 유지보수 단일 경로, SEO 유리, 초기 비용 낮음.";

describe("chat leak probe round 23 (hangul-titled slide body / incomplete opener)", () => {
  it("drops Hangul-titled slide dumps without LECTURE/axe fingerprints", () => {
    expect(sanitizeAssistantProseForDisplay(HANGUL_TITLED_LEAK, { stripCodeFences: true })).toBe(
      "",
    );
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 작업이 완료되었습니다.\n${HANGUL_TITLED_LEAK}`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 작업이 완료되었습니다.");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중${HANGUL_TITLED_LEAK}`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중");
  });

  it("drops incomplete section/div slide openers with orphan closer", () => {
    expect(
      sanitizeAssistantProseForDisplay(`section class=slide>COVER TRACK 반응형</artifact>`, {
        stripCodeFences: true,
      }),
    ).toBe("");
    expect(
      sanitizeAssistantProseForDisplay(
        `완료.\nsection class="slide">반응형 UIvideo·svg SEO 유리</artifact>`,
        { stripCodeFences: true },
      ),
    ).toBe("완료.");
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
