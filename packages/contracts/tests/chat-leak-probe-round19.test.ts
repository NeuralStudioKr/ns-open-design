import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 19 — Hangul-glued CSS at-rules / custom props / cubic-bezier,
 * leftover CSS functions, and SVG/JS dumps.
 */
describe("chat leak probe round 19 (hangul at-rule / css fn / svg attr)", () => {
  it("cuts Hangul glued to later CSS at-rules and custom props", () => {
    expect(
      sanitizeAssistantProseForDisplay(
        `슬라이드 추가 중@container slide (min-width: 800px) { .x { color: red } }`,
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중@scope (.slide) { h1 { margin: 0 } }`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(
        `슬라이드 추가 중@property --ink { syntax: '<color>'; inherits: true }`,
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중@starting-style { .x { opacity: 0 } }`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중--bg:#2d2a26;--fg:#fff;`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중cubic-bezier(0.23, 1, 0.32, 1);`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중");
  });

  it("drops leftover CSS functions and SVG/JS dumps", () => {
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nanchor-size(--dot width);`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\ncalc-size(auto, size + 12px);`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nscroll(root nearest);`, { stripCodeFences: true }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nview(y nearest);`, { stripCodeFences: true }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nray(45deg closest-side);`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nattr(data-label string);`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\ncounter(slide, decimal-leading-zero);`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nsibling-index();`, { stripCodeFences: true }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nsibling-count();`, { stripCodeFences: true }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nif(style(--dark): #111; else: #fff);`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(
        `진행.\nvalues="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"`,
        { stripCodeFences: true },
      ),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\ngradientTransform="rotate(25)"`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(`진행.\nin="SourceGraphic" result="goo"`, {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(
        `진행.\nCSS.supports('color', 'color-mix(in srgb, red, blue)')`,
        { stripCodeFences: true },
      ),
    ).toBe("진행.");
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
    expect(
      sanitizeAssistantProseForDisplay("슬라이드를 추가 중입니다 font-size 조정이 필요합니다", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드를 추가 중입니다 font-size 조정이 필요합니다");
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
