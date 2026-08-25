import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 12 — leftovers after fullwidth/css-fn: same-line incomplete 3+
 * letter tags, framework/SVG attrs, bare rgb/url(#), unclosed CSS
 * comments, and DOM tree injectors.
 */
const CASES: Array<{ name: string; input: string; keep?: string }> = [
  { name: "same-line incomplete div", input: `초안. <div`, keep: "초안." },
  { name: "same-line incomplete section", input: `초안. <section`, keep: "초안." },
  { name: "same-line incomplete span", input: `초안. <span`, keep: "초안." },
  { name: "same-line incomplete svg", input: `초안. <svg`, keep: "초안." },
  { name: "same-line incomplete h1", input: `초안. <h1`, keep: "초안." },
  { name: "react style attr leftover", input: `초안. style={{color:'red'}}`, keep: "초안." },
  { name: "vue click", input: `초안. @click="next()"`, keep: "초안." },
  { name: "vue bind class", input: `초안. :class="slide"`, keep: "초안." },
  { name: "vue v-html attr", input: `초안. v-html="html"`, keep: "초안." },
  { name: "svelte onclick", input: `초안. on:click={next}`, keep: "초안." },
  { name: "svg points", input: `초안. points="0,0 10,0 10,10"`, keep: "초안." },
  { name: "svg transform attr", input: `초안. transform="translate(12,8)"`, keep: "초안." },
  { name: "clip-path attr", input: `초안. clip-path="url(#a)"`, keep: "초안." },
  { name: "srcdoc attr", input: `초안. srcdoc="<p>x</p>"`, keep: "초안." },
  { name: "sandbox attr", input: `초안. sandbox="allow-scripts"`, keep: "초안." },
  { name: "rgba whole line", input: `초안.\nrgba(245,240,230,0.8)`, keep: "초안." },
  { name: "rgb whole line", input: `초안.\nrgb(245, 240, 230)`, keep: "초안." },
  { name: "url hash leftover", input: `초안.\nurl(#motif)`, keep: "초안." },
  { name: "unclosed css comment", input: `초안.\n/* Daisy motif TL`, keep: "초안." },
  { name: "aspect-ratio decl", input: `초안.\naspect-ratio: 16/9`, keep: "초안." },
  { name: "color-scheme decl", input: `초안.\ncolor-scheme: dark`, keep: "초안." },
  { name: "appendChild", input: `진행.\nroot.appendChild(el)`, keep: "진행." },
  { name: "cssText assign", input: `진행.\nel.style.cssText = 'color:red'`, keep: "진행." },
  { name: "setProperty", input: `진행.\nel.style.setProperty('--bg', '#F5F0E6')`, keep: "진행." },
  { name: "replaceChildren", input: `진행.\nroot.replaceChildren()`, keep: "진행." },
  { name: "zwsp before tag", input: `진행.\n\u200b<div class="slide">x</div>`, keep: "진행." },
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
  { name: "visible intro stays", input: "Visible intro to the deck.", keep: "Visible intro to the deck." },
  { name: "incomplete p stream stays", input: "Text <p", keep: "Text <p" },
  { name: "incomplete a stream stays", input: "Text <a", keep: "Text <a" },
  { name: "incomplete em stream stays", input: "Text <em", keep: "Text <em" },
  { name: "incomplete https stays", input: "참고: <https", keep: "참고: <https" },
];

function looksLikeDeckDebris(out: string): boolean {
  return /<(?!https?:)[a-zA-Z][\w:-]{2,}\b|style=\{\{|@click|:class=|v-html=|on:click|points\s*=|srcdoc\s*=|sandbox\s*=|rgba?\s*\(|url\(\s*#|\/\*|aspect-ratio|color-scheme|appendChild|cssText|setProperty|replaceChildren|\u200b/i.test(
    out,
  );
}

describe("chat leak probe round 12 (incomplete tag / framework attr / rgb / dom tree)", () => {
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
