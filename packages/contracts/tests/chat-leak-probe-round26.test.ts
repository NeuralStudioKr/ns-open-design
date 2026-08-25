import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 26 — Hangul crumbs left after opener/doctype dump cuts
 * (`다.body>…` → `다`, `됨<!doctype…` → `됨표지`).
 */
describe("chat leak probe round 26 (Hangul status crumbs)", () => {
  it("drops 1–2 Hangul crumbs glued to body/section/html openers", () => {
    expect(
      sanitizeAssistantProseForDisplay("다.body>WD · INTRO반응형 UI SEO</body>", {
        stripCodeFences: true,
      }),
    ).toBe("");
    expect(
      sanitizeAssistantProseForDisplay("요.section>COVER TRACK</section>", {
        stripCodeFences: true,
      }),
    ).toBe("");
    expect(
      sanitizeAssistantProseForDisplay("중html>LECTURE</artifact>", {
        stripCodeFences: true,
      }),
    ).toBe("");
  });

  it("drops Hangul crumbs glued to doctype leftovers", () => {
    expect(
      sanitizeAssistantProseForDisplay("됨<!doctype html>표지</html>", {
        stripCodeFences: true,
      }),
    ).toBe("");
  });

  it("keeps real status phrases before dumps", () => {
    expect(
      sanitizeAssistantProseForDisplay(
        "슬라이드 작업이 완료되었습니다.body>WD · INTRO반응형 UI SEO</body>",
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 작업이 완료되었습니다");
    expect(
      sanitizeAssistantProseForDisplay(
        "슬라이드 작업이 완료되었습니다.body>WD · INTRO반응형 UI SEO</body>",
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 작업이 완료되었습니다");
    expect(
      sanitizeAssistantProseForDisplay("슬라이드 추가 중body>SEO 유리</body>", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay("완료됨.TRACK반응형 UIvideo·svg SEO 유리", {
        stripCodeFences: true,
      }),
    ).toBe("완료됨.");
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
