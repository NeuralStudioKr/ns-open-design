import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 16 — font-face / CSS sizing leftovers after the Caveat/Zilla review:
 * `url(...woff2) format('woff2')` and `fit-content()` dumps.
 */
describe("chat leak probe round 16 (font url / fit-content)", () => {
  it("drops a leftover font file url + format(woff2) line", () => {
    expect(
      sanitizeAssistantProseForDisplay(
        `진행.\nurl('https://fonts.gstatic.com/s/caveat/v1.woff2') format('woff2');`,
        { stripCodeFences: true },
      ),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`초안.\nformat('woff2');`, { stripCodeFences: true }),
    ).toBe("초안.");
  });

  it("drops fit-content / local() leftovers", () => {
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nfit-content(32ch); padding: 12px;`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`초안.\nlocal('Zilla Slab'), url('x.woff2');`, {
        stripCodeFences: true,
      }),
    ).toBe("초안.");
  });

  it("keeps the original Caveat/Zilla user dump collapsed", () => {
    const userLeak = [
      "슬라이드 추가 중Caveat',cursive;font-size:23px;line-height:1.75;margin:0;padding-left:20px;\"> 5px 0 ",
      "#2d2a26;padding:28px;transform:rotate(0.6deg);\">Syft로 CycloneDX/SPDX 생성",
      "#2d2a26;padding:28px;transform:rotate(-0.4deg);\">:'Zilla Slab',",
    ].join("\n");
    expect(sanitizeAssistantProseForDisplay(userLeak, { stripCodeFences: true })).toBe(
      "슬라이드 추가 중",
    );
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
