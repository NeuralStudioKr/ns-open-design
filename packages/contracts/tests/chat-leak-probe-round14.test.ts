import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 14 — user-reported Daisy/Zilla mid-style leak: Hangul status glued
 * to a truncated font-family value, then hex-started style tails and
 * `">:'Zilla Slab'` leftovers.
 */
const USER_LEAK = [
  "슬라이드 추가 중Caveat',cursive;font-size:23px;line-height:1.75;margin:0;padding-left:20px;\"> 5px 0 ",
  "#2d2a26;padding:28px;transform:rotate(0.6deg);\">Syft로 CycloneDX/SPDX 생성, Grype로 CVE 스캔SLSA Level 3: hermetic build + 검증 가능한 출처9c9,",
  "#ff9f9f);border:2px solid ",
  "#2d2a26;box-shadow:4px 5px 0 ",
  "#2d2a26;padding:28px;transform:rotate(-0.4deg);\">:'Zilla Slab',",
].join("\n");

describe("chat leak probe round 14 (hangul + truncated font-family / hex style)", () => {
  it("keeps only the Hangul status from the user-reported dump", () => {
    const out = sanitizeAssistantProseForDisplay(USER_LEAK, { stripCodeFences: true });
    expect(out).toBe("슬라이드 추가 중");
    expect(out).not.toMatch(/Caveat|cursive|font-size|#2d2a26|Zilla|Syft|SLSA|box-shadow|padding-left/i);
  });

  it("cuts Hangul glued to a truncated Caveat font stack", () => {
    expect(
      sanitizeAssistantProseForDisplay(
        `슬라이드 추가 중Caveat',cursive;font-size:23px;line-height:1.75;margin:0;">x`,
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 추가 중");
  });

  it("drops hex-started mid-style tails", () => {
    expect(
      sanitizeAssistantProseForDisplay(
        `진행.\n#2d2a26;padding:28px;transform:rotate(0.6deg);">본문`,
        { stripCodeFences: true },
      ),
    ).toBe("진행.");
  });

  it("drops a leftover Zilla font fragment after style close", () => {
    expect(
      sanitizeAssistantProseForDisplay(`초안.\n">:'Zilla Slab',`, { stripCodeFences: true }),
    ).toBe("초안.");
  });

  it("keeps markdown and streaming prefixes", () => {
    expect(
      sanitizeAssistantProseForDisplay("요약.\n# 다음 단계\n- 차트 추가", { stripCodeFences: true }),
    ).toBe("요약.\n# 다음 단계\n- 차트 추가");
    expect(sanitizeAssistantProseForDisplay("Text <p", { stripCodeFences: true })).toBe("Text <p");
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
