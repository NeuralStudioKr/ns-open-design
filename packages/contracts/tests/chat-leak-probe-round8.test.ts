import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 8 — unknown HTML dialects the named residual allowlist still
 * left in the bubble: anchors, images, blockquotes, details, custom
 * elements, void tags, and same-line Hangul + dump.
 */
const CASES: Array<{ name: string; input: string; keep?: string }> = [
  {
    name: "same-line anchor dump",
    input: `초안. <a href="https://x.test">링크</a>`,
    keep: "초안.",
  },
  {
    name: "img void tag",
    input: `메모.\n<img src="cover.png" alt="커버">`,
    keep: "메모.",
  },
  {
    name: "blockquote",
    input: `<blockquote>인용</blockquote>`,
  },
  {
    name: "details/summary",
    input: `<details><summary>열기</summary>본문</details>`,
  },
  {
    name: "mark inline",
    input: `진행. <mark>강조</mark>`,
    keep: "진행.",
  },
  {
    name: "hr void",
    input: `초안.\n<hr>`,
    keep: "초안.",
  },
  {
    name: "label/form",
    input: `<form action="/"><label for="x">이름</label><input type="text"></form>`,
  },
  {
    name: "custom slide-counter",
    input: `<slide-counter>3 / 8</slide-counter>`,
  },
  {
    name: "custom motif pill",
    input: `<x-motif-pill>Nx</x-motif-pill>`,
  },
  {
    name: "doctype plus slide paragraph",
    input: `<!DOCTYPE html>\n<html><body><p class="slide">hi</p></body></html>`,
  },
  {
    name: "markdown still intact",
    input: "요약.\n# 다음 단계\n- 차트 추가\n- 표 정리",
    keep: "요약.\n# 다음 단계\n- 차트 추가\n- 표 정리",
  },
  {
    name: "backtick html mention preserved",
    input: "태그는 `<img>` 형태입니다.",
    keep: "태그는 `<img>` 형태입니다.",
  },
  {
    name: "markdown autolink preserved",
    input: "참고: <https://example.com/deck>",
    keep: "참고: <https://example.com/deck>",
  },
];

function looksLikeDeckDebris(out: string): boolean {
  return /<\/?(?!https?:)[a-zA-Z][\w:-]*\b|<!--|-->|&lt;(?:img|a|mark|form|label|hr|blockquote|details|slide-)/i.test(
    out,
  );
}

describe("chat leak probe round 8 (unknown HTML tags)", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const out = sanitizeAssistantProseForDisplay(c.input, { stripCodeFences: true });
      if (c.keep !== undefined) {
        expect(out).toBe(c.keep);
      } else {
        expect(out.trim()).toBe("");
      }
      if (!c.name.includes("backtick") && !c.name.includes("autolink") && !c.name.includes("markdown")) {
        expect(looksLikeDeckDebris(out)).toBe(false);
      }
    });
  }

  it("keeps a closed question-form for the Questions banner parser", () => {
    const input = `질문\n<question-form id="discovery">{"questions":[{"id":"1"}]}</question-form>`;
    const out = sanitizeAssistantProseForDisplay(input, { stripCodeFences: true });
    expect(out).toContain("<question-form id=\"discovery\">");
    expect(out).toContain("</question-form>");
    expect(out).toContain("질문");
  });
});
