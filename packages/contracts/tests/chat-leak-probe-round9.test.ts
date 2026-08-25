import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 9 — leftovers after the unknown-tag last-pass: XML/CDATA wrappers,
 * pretty-printed tags split across lines, br-stacked titles, double-escaped
 * entities, glued CSS, and attribute tails.
 */
const CASES: Array<{ name: string; input: string; keep?: string }> = [
  {
    name: "xml declaration from svg dump",
    input: `<?xml version="1.0"?>\n<svg viewBox="0 0 10 10"></svg>`,
  },
  {
    name: "xml stylesheet PI",
    input: `<?xml-stylesheet href="deck.css"?>`,
  },
  {
    name: "cdata wrapper",
    input: `<![CDATA[<div class="slide">x</div>]]>`,
  },
  {
    name: "pretty-printed tag split across lines",
    input: `<div\nclass="x">본문</div>`,
  },
  {
    name: "pretty-printed tag after Hangul status",
    input: `진행.\n<div\nclass="slide">본문</div>`,
    keep: "진행.",
  },
  {
    name: "br-stacked title line",
    input: `초안.\n제목<br/>부제`,
    keep: "초안.",
  },
  {
    name: "double-escaped entity tags",
    input: `진행.\n&amp;lt;div&amp;gt;`,
    keep: "진행.",
  },
  {
    name: "rgb leftover css line",
    input: `초안.\nrgb(245,240,230);padding:24px`,
    keep: "초안.",
  },
  {
    name: "Hangul glued css without space",
    input: `정리 중font-size:14px;letter-spacing:.2em`,
    keep: "정리 중",
  },
  {
    name: "trailing void slash",
    input: `초안. />`,
    keep: "초안.",
  },
  {
    name: "class attr tail after status",
    input: `초안. class="card pill"`,
    keep: "초안.",
  },
  {
    name: "role attr tail after status",
    input: `초안. " role="presentation"`,
    keep: "초안.",
  },
  {
    name: "markdown still intact",
    input: "요약.\n# 다음 단계\n- 차트 추가",
    keep: "요약.\n# 다음 단계\n- 차트 추가",
  },
  {
    name: "backtick html mention preserved",
    input: "태그는 `<div>` 형태입니다.",
    keep: "태그는 `<div>` 형태입니다.",
  },
  {
    name: "markdown autolink preserved",
    input: "참고: <https://example.com/deck>",
    keep: "참고: <https://example.com/deck>",
  },
];

function looksLikeDeckDebris(out: string): boolean {
  return /<\?xml|<!\[CDATA|<\/?(?!https?:)[a-zA-Z][\w:-]*\b|&amp;lt;|rgb\s*\(|font-size\s*:|class\s*=|role\s*=|\/\s*>/i.test(
    out,
  );
}

describe("chat leak probe round 9 (xml / split-tag / attr tails)", () => {
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
    expect(out).toContain('<question-form id="discovery">');
    expect(out).toContain("질문");
  });
});
