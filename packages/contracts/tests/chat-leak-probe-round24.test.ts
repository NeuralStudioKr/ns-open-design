import { describe, expect, it } from "vitest";
import {
  looksLikeTagStrippedSlideBodyDump,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

/**
 * Round 24 — leftover slide body is a shape, not one lecture's copy.
 * Reload/cold-load can drop the open `<artifact` and leave `body>`, `section>`,
 * `<!doctype`, or punctuation-glued `다.body>` tails.
 */
const BODY_LEAK =
  "body>WD · INTRO반응형 UI 유지보수 단일 경로, SEO 유리. font-size:2rem color:#111</body>";
const SECTION_LEAK =
  "section>핵심 메시지HTML/CSS 재배치. 유동 레이아웃.</section>";
const DOCTYPE_LEAK =
  "<!doctype html>표지 타이틀반응형 UI font-size:18px</html>";

describe("chat leak probe round 24 (shape leftover, not lecture copy)", () => {
  it("drops leftover openers that are not html> / LECTURE", () => {
    expect(looksLikeTagStrippedSlideBodyDump(BODY_LEAK)).toBe(true);
    expect(looksLikeTagStrippedSlideBodyDump(SECTION_LEAK)).toBe(true);
    expect(looksLikeTagStrippedSlideBodyDump(DOCTYPE_LEAK)).toBe(true);
    expect(sanitizeAssistantProseForDisplay(BODY_LEAK, { stripCodeFences: true })).toBe("");
    expect(sanitizeAssistantProseForDisplay(SECTION_LEAK, { stripCodeFences: true })).toBe("");
    expect(sanitizeAssistantProseForDisplay(DOCTYPE_LEAK, { stripCodeFences: true })).toBe("");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 작업이 완료되었습니다.\n${BODY_LEAK}`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 작업이 완료되었습니다.");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중${BODY_LEAK}`, { stripCodeFences: true }),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 작업이 완료되었습니다.${BODY_LEAK}`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 작업이 완료되었습니다");
  });

  it("does not treat intended Hangul prose as leftover", () => {
    expect(
      looksLikeTagStrippedSlideBodyDump("슬라이드 추가 중\n차트 축 라벨을 확인하세요"),
    ).toBe(false);
    expect(
      looksLikeTagStrippedSlideBodyDump("슬라이드를 추가 중입니다 font-size 조정이 필요합니다"),
    ).toBe(false);
    expect(looksLikeTagStrippedSlideBodyDump("Visible intro")).toBe(false);
    expect(looksLikeTagStrippedSlideBodyDump("Text <p")).toBe(false);
    expect(looksLikeTagStrippedSlideBodyDump("참고: <https://example.com>")).toBe(false);
    expect(looksLikeTagStrippedSlideBodyDump("# 다음 단계\n- 차트 추가")).toBe(false);
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
    expect(sanitizeAssistantProseForDisplay("Text <p", { stripCodeFences: true })).toBe("Text <p");
    expect(
      sanitizeAssistantProseForDisplay("요약.\n# 다음 단계\n- 차트 추가", { stripCodeFences: true }),
    ).toBe("요약.\n# 다음 단계\n- 차트 추가");
  });

  it("keeps a closed question-form and does not classify an open form as leftover", () => {
    const closed = `질문\n<question-form id="discovery">{"questions":[{"id":"1"}]}</question-form>`;
    expect(looksLikeTagStrippedSlideBodyDump(closed)).toBe(false);
    const out = sanitizeAssistantProseForDisplay(closed, { stripCodeFences: true });
    expect(out).toContain("<question-form");
    expect(out).toContain("질문");
    const open = `Planning…\n<question-form id="discovery">{"questions":[`;
    expect(looksLikeTagStrippedSlideBodyDump(open)).toBe(false);
  });
});
