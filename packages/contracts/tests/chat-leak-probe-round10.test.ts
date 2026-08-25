import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 10 — leftovers after xml/split-tag/attr-tail: encoded tags,
 * unclosed PI, IE conditionals, SVG/XML attribute dumps, CSS function
 * lines, and JS HTML injectors.
 */
const CASES: Array<{ name: string; input: string; keep?: string }> = [
  {
    name: "midline unclosed xml pi",
    input: `초안. <?xml version="1.0"`,
    keep: "초안.",
  },
  {
    name: "numeric entity tags",
    input: `진행.\n&#60;div class="slide"&#62;본문&#60;/div&#62;`,
    keep: "진행.",
  },
  {
    name: "hex entity tags",
    input: `진행.\n&#x3C;span style="color:red"&#x3E;x&#x3C;/span&#x3E;`,
    keep: "진행.",
  },
  {
    name: "triple amp entity",
    input: `진행.\n&amp;amp;lt;div&amp;amp;gt;`,
    keep: "진행.",
  },
  {
    name: "unicode escape tags",
    input: `진행.\n\\u003cdiv class="x"\\u003e`,
    keep: "진행.",
  },
  {
    name: "url encoded tags",
    input: `진행.\n%3Cdiv class="x"%3E`,
    keep: "진행.",
  },
  {
    name: "unquoted class tail",
    input: `초안. class=card`,
    keep: "초안.",
  },
  {
    name: "data-slide attr tail",
    input: `초안. data-slide="1"`,
    keep: "초안.",
  },
  {
    name: "xmlns attr tail",
    input: `초안. xmlns="http://www.w3.org/2000/svg"`,
    keep: "초안.",
  },
  {
    name: "viewBox attr tail",
    input: `초안. viewBox="0 0 1920 1080"`,
    keep: "초안.",
  },
  {
    name: "path d attr tail",
    input: `초안. d="M0 0h10v10H0z"`,
    keep: "초안.",
  },
  {
    name: "void slash no space",
    input: `초안./>`,
    keep: "초안.",
  },
  {
    name: "ie conditional",
    input: `진행.\n<![if IE]>\n<div>x</div>\n<![endif]>`,
    keep: "진행.",
  },
  {
    name: "linear-gradient line",
    input: `초안.\nlinear-gradient(90deg,#F5F0E6,#fff)`,
    keep: "초안.",
  },
  {
    name: "var custom prop line",
    input: `초안.\nvar(--bg)`,
    keep: "초안.",
  },
  {
    name: "oklch line",
    input: `초안.\noklch(0.92 0.02 80)`,
    keep: "초안.",
  },
  {
    name: "hsl space line",
    input: `초안.\nhsl(30 20% 90%)`,
    keep: "초안.",
  },
  {
    name: "data uri leftover",
    input: `초안.\nurl(data:image/svg+xml;base64,PHN2Zy)`,
    keep: "초안.",
  },
  {
    name: "innerHTML assign",
    input: `진행.\nel.innerHTML = '<section class="slide">x</section>'`,
    keep: "진행.",
  },
  {
    name: "classList add",
    input: `진행.\nslides[i].classList.add('is-active')`,
    keep: "진행.",
  },
  {
    name: "insertAdjacentHTML",
    input: `진행.\nroot.insertAdjacentHTML('beforeend', html)`,
    keep: "진행.",
  },
  {
    name: "mustache html",
    input: `진행.\n{{#each slides}}<div>{{title}}</div>{{/each}}`,
    keep: "진행.",
  },
  {
    name: "erb leftover",
    input: `진행.\n<%= slide.title %>`,
    keep: "진행.",
  },
  {
    name: "srcset leftover",
    input: `초안. srcset="a.png 1x, b.png 2x"`,
    keep: "초안.",
  },
  {
    name: "tabindex leftover",
    input: `초안. tabindex="-1"`,
    keep: "초안.",
  },
  {
    name: "svg xmlns line",
    input: `진행.\nxmlns="http://www.w3.org/2000/svg" width="1920"`,
    keep: "진행.",
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
  {
    name: "visible intro stays",
    input: "Visible intro to the deck.",
    keep: "Visible intro to the deck.",
  },
  {
    name: "incomplete p stream stays",
    input: "Text <p",
    keep: "Text <p",
  },
  {
    name: "incomplete a stream stays",
    input: "Text <a",
    keep: "Text <a",
  },
];

function looksLikeDeckDebris(out: string): boolean {
  return /<\?xml|<!\[|<\/?(?!https?:)[a-zA-Z][\w:-]*\b|&(?:amp;)+lt;|&#(?:60|x3c);|\\u003c|%3c[a-z]|xmlns\s*=|viewBox\s*=|linear-gradient\s*\(|oklch\s*\(|innerHTML|insertAdjacentHTML|classList\.|srcset\s*=|tabindex\s*=/i.test(
    out,
  );
}

describe("chat leak probe round 10 (encoded tags / svg attr / css fn / js html)", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const out = sanitizeAssistantProseForDisplay(c.input, { stripCodeFences: true });
      if (c.keep !== undefined) {
        expect(out).toBe(c.keep);
      } else {
        expect(out.trim()).toBe("");
      }
      if (!c.name.includes("backtick") && !c.name.includes("autolink") && !c.name.includes("markdown") && !c.name.includes("visible") && !c.name.includes("incomplete")) {
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
