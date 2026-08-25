import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 11 — leftovers after encoded-tag / svg-attr / css-fn: fullwidth
 * brackets, CSS at-rules and bare functions, event/SVG attr tails, DOM
 * injectors, template chrome, and data-URI markdown images.
 */
const CASES: Array<{ name: string; input: string; keep?: string }> = [
  {
    name: "fullwidth tags",
    input: `진행.\n＜div class="slide"＞본문＜/div＞`,
    keep: "진행.",
  },
  {
    name: "fullwidth xml",
    input: `초안. ＜?xml version="1.0"?＞`,
    keep: "초안.",
  },
  {
    name: "cdata closer leftover",
    input: `초안.\n]]>`,
    keep: "초안.",
  },
  {
    name: "css comment line",
    input: `초안.\n/* Daisy motif TL */`,
    keep: "초안.",
  },
  {
    name: "at-charset",
    input: `초안.\n@charset "UTF-8";`,
    keep: "초안.",
  },
  {
    name: "at-namespace",
    input: `초안.\n@namespace url(http://www.w3.org/2000/svg);`,
    keep: "초안.",
  },
  {
    name: "at-property",
    input: `초안.\n@property --bg { syntax: "<color>"; inherits: false }`,
    keep: "초안.",
  },
  {
    name: "bare calc",
    input: `초안.\ncalc(100% - 48px)`,
    keep: "초안.",
  },
  {
    name: "bare clamp",
    input: `초안.\nclamp(1rem, 2vw, 2rem)`,
    keep: "초안.",
  },
  {
    name: "bare translate3d",
    input: `초안.\ntranslate3d(0,12px,0)`,
    keep: "초안.",
  },
  {
    name: "bare rotate",
    input: `초안.\nrotate(-8deg)`,
    keep: "초안.",
  },
  {
    name: "bare scale",
    input: `초안.\nscale(0.9)`,
    keep: "초안.",
  },
  {
    name: "bare matrix",
    input: `초안.\nmatrix(1,0,0,1,0,0)`,
    keep: "초안.",
  },
  {
    name: "important leftover",
    input: `초안.\n!important;`,
    keep: "초안.",
  },
  {
    name: "tailwind arbitrary",
    input: `초안.\nbg-[#F5F0E6] w-[1920px] h-[1080px]`,
    keep: "초안.",
  },
  {
    name: "onclick attr",
    input: `초안. onclick="next()"`,
    keep: "초안.",
  },
  {
    name: "onkeydown attr",
    input: `초안. onkeydown="go(1)"`,
    keep: "초안.",
  },
  {
    name: "xlink href attr",
    input: `초안. xlink:href="#motif"`,
    keep: "초안.",
  },
  {
    name: "stroke-width attr",
    input: `초안. stroke-width="2.07"`,
    keep: "초안.",
  },
  {
    name: "setAttribute",
    input: `진행.\nel.setAttribute('class', 'slide')`,
    keep: "진행.",
  },
  {
    name: "querySelector no document",
    input: `진행.\nquerySelector('.slide')`,
    keep: "진행.",
  },
  {
    name: "querySelectorAll",
    input: `진행.\nquerySelectorAll('.slide')`,
    keep: "진행.",
  },
  {
    name: "className assign",
    input: `진행.\nel.className = 'slide is-active'`,
    keep: "진행.",
  },
  {
    name: "className attr",
    input: `초안. className="slide"`,
    keep: "초안.",
  },
  {
    name: "svelte each",
    input: `진행.\n{#each slides as slide}<div>{slide}</div>{/each}`,
    keep: "진행.",
  },
  {
    name: "liquid for",
    input: `진행.\n{% for slide in slides %}<div>{{slide}}</div>{% endfor %}`,
    keep: "진행.",
  },
  {
    name: "markdown data image",
    input: `초안.\n![](data:image/svg+xml;base64,PHN2Zy)`,
    keep: "초안.",
  },
  {
    name: "css content dump",
    input: `초안.\ncontent: "\\A";`,
    keep: "초안.",
  },
  {
    name: "mixed quote attr",
    input: `초안. class="card'`,
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
  return /＜|＞|\]\]>|\/\*|@charset|@namespace|@property|calc\s*\(|clamp\s*\(|translate3d\s*\(|onclick\s*=|setAttribute|querySelector|className\s*=|\{#each|\{%\s*for|data:image\/svg|content\s*:|!important|bg-\[#/i.test(
    out,
  );
}

describe("chat leak probe round 11 (fullwidth / css-fn / event attr / dom inject)", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const out = sanitizeAssistantProseForDisplay(c.input, { stripCodeFences: true });
      if (c.keep !== undefined) {
        expect(out).toBe(c.keep);
      } else {
        expect(out.trim()).toBe("");
      }
      if (
        !c.name.includes("backtick")
        && !c.name.includes("autolink")
        && !c.name.includes("markdown")
        && !c.name.includes("visible")
        && !c.name.includes("incomplete")
      ) {
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
