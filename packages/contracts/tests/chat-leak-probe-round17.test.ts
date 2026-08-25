import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 17 — @font-face body leftovers after the Caveat/Zilla review:
 * `src: url(...woff2)`, Hangul-glued `url(`/`local(`/`src:`, unicode-range
 * `U+0000`, and CSS functions that currently leave a chopped residue
 * (`circle(50%`).
 */
describe("chat leak probe round 17 (font-face src / unicode-range / css fn)", () => {
  it("drops src: url(...woff2) format() font-face body lines", () => {
    expect(
      sanitizeAssistantProseForDisplay(
        `진행.\nsrc: url('https://fonts.gstatic.com/s/caveat/v22.woff2') format('woff2');`,
        { stripCodeFences: true },
      ),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nx.woff2') format('woff2');`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\ntech(color-COLRv1), url('x.woff2');`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
  });

  it("cuts Hangul status glued to url/src/local font leftovers", () => {
    expect(
      sanitizeAssistantProseForDisplay(
        `슬라이드 추가 중url('https://fonts.gstatic.com/s/caveat/v1.woff2') format('woff2');`,
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(
        `슬라이드 추가 중src: url('./Caveat.woff2') format('woff2');`,
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(
        `슬라이드 추가 중local('Zilla Slab'), url('x.woff2');`,
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 추가 중");
  });

  it("drops unicode-range leftovers and font-stack var() tails", () => {
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nU+0000-00FF, U+0131, U+0152-0153;`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(
        `진행.\nvar(--font-display), 'Noto Sans KR', sans-serif;`,
        { stripCodeFences: true },
      ),
    ).toBe("진행.");
  });

  it("drops whole CSS function leftovers instead of chopped residues", () => {
    expect(
      sanitizeAssistantProseForDisplay(`진행.\ncircle(50% at 20% 20%);`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\ndrop-shadow(4px 5px 0 #2d2a26);`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nblur(12px) saturate(1.1);`, {
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
    expect(
      sanitizeAssistantProseForDisplay("참고: <https://example.com>", { stripCodeFences: true }),
    ).toBe("참고: <https://example.com>");
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
