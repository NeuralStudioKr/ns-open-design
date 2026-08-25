import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 21 — reload/cold-load leftover after the `<artifact` open is lost:
 * `html>WD · LECTURE…</artifact>` (fine at turn-end, leaks on re-entry).
 */
const RELOAD_LEAK =
  "html>WD · LECTURE 01 · FRONT-END TRACK반응형 UIvideo·svg에일 HTML/CSS, 미디어 쿼리로 유동 재배치. 유지보수 단일 경로, SEO 유리, 초기 비용 낮음.능·접 90, axe-core0 critical, prefers-reduced-motion 대응.</artifact>";

describe("chat leak probe round 21 (reload html> artifact tail)", () => {
  it("drops the reported reload leftover and keeps a leading status", () => {
    expect(sanitizeAssistantProseForDisplay(RELOAD_LEAK, { stripCodeFences: true })).toBe("");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 작업이 완료되었습니다.\n${RELOAD_LEAK}`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 작업이 완료되었습니다.");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중${RELOAD_LEAK}`, { stripCodeFences: true }),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(
        "WD · LECTURE 01 · FRONT-END TRACK반응형 UIvideo·svg에일 HTML/CSS, 미디어 쿼리로 유동 재배치. 유지보수 단일 경로, SEO 유리, 초기 비용 낮음.능·접 90, axe-core0 critical, prefers-reduced-motion 대응.",
        { stripCodeFences: true },
      ),
    ).toBe("");
  });

  it("still strips a well-formed closed artifact from history display", () => {
    expect(
      sanitizeAssistantProseForDisplay(
        `완료.\n<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide">반응형 UI</section></body></html></artifact>`,
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
