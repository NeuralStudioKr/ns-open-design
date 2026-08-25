import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 13 — leftovers after incomplete-tag/framework-attr: more encodings,
 * Angular/Alpine/HTMX/SVG/media attrs, CSS functions, SCSS, and HTML/CSSOM
 * injectors. Same-line rgb/gradient/comment dumps.
 */
const CASES: Array<{ name: string; input: string; keep?: string }> = [
  { name: "same-line bare lt q", input: `초안. <?`, keep: "초안." },
  { name: "hex escape tags", input: `진행.\n\\x3cdiv class="x"\\x3e`, keep: "진행." },
  { name: "unicode brace escape", input: `진행.\n\\u{3c}div\\u{3e}`, keep: "진행." },
  { name: "angular click", input: `초안. (click)="next()"`, keep: "초안." },
  { name: "angular ngClass", input: `초안. [ngClass]="slide"`, keep: "초안." },
  { name: "angular ngIf", input: `초안. *ngIf="open"`, keep: "초안." },
  { name: "alpine x-show", input: `초안. x-show="open"`, keep: "초안." },
  { name: "alpine click prevent", input: `초안. @click.prevent="next"`, keep: "초안." },
  { name: "hx-swap", input: `초안. hx-swap="outerHTML"`, keep: "초안." },
  { name: "hx-get attr", input: `초안. hx-get="/slides"`, keep: "초안." },
  { name: "colspan", input: `초안. colspan="3"`, keep: "초안." },
  { name: "rowspan", input: `초안. rowspan="2"`, keep: "초안." },
  { name: "fill attr", input: `초안. fill="#F5F0E6"`, keep: "초안." },
  { name: "cx cy r", input: `진행.\ncx="96" cy="96" r="40"`, keep: "진행." },
  { name: "gradientUnits", input: `초안. gradientUnits="userSpaceOnUse"`, keep: "초안." },
  { name: "stop-color", input: `초안. stop-color="#FDE68A"`, keep: "초안." },
  { name: "stdDeviation", input: `초안. stdDeviation="8"`, keep: "초안." },
  { name: "loading lazy", input: `초안. loading="lazy"`, keep: "초안." },
  { name: "decoding async", input: `초안. decoding="async"`, keep: "초안." },
  { name: "fetchpriority", input: `초안. fetchpriority="high"`, keep: "초안." },
  { name: "crossorigin", input: `초안. crossorigin="anonymous"`, keep: "초안." },
  { name: "integrity", input: `초안. integrity="sha384-abc"`, keep: "초안." },
  { name: "poster", input: `초안. poster="cover.png"`, keep: "초안." },
  { name: "playsinline", input: `초안. playsinline`, keep: "초안." },
  { name: "light-dark fn", input: `초안.\nlight-dark(#F5F0E6,#111)`, keep: "초안." },
  { name: "image-set fn", input: `초안.\nimage-set(url(a.png) 1x, url(b.png) 2x)`, keep: "초안." },
  { name: "env safe area", input: `초안.\nenv(safe-area-inset-top)`, keep: "초안." },
  { name: "steps timing", input: `초안.\nsteps(4, end)`, keep: "초안." },
  { name: "unicode-range", input: `초안.\nunicode-range: U+0000-00FF`, keep: "초안." },
  { name: "scss var", input: `초안.\n$bg: #F5F0E6;`, keep: "초안." },
  { name: "DOMParser", input: `진행.\nnew DOMParser().parseFromString(html, 'text/html')`, keep: "진행." },
  { name: "createContextualFragment", input: `진행.\nrange.createContextualFragment(html)`, keep: "진행." },
  { name: "adoptedStyleSheets", input: `진행.\ndocument.adoptedStyleSheets = [sheet]`, keep: "진행." },
  { name: "CSSStyleSheet", input: `진행.\nnew CSSStyleSheet()`, keep: "진행." },
  { name: "replaceSync", input: `진행.\nsheet.replaceSync(css)`, keep: "진행." },
  { name: "setAttributeNS", input: `진행.\nel.setAttributeNS(ns, 'href', '#a')`, keep: "진행." },
  { name: "srcdoc assign", input: `진행.\niframe.srcdoc = html`, keep: "진행." },
  { name: "styled.div", input: "진행.\nconst Box = styled.div`color: red;`", keep: "진행." },
  { name: "css template", input: "진행.\ncss`color: red;`", keep: "진행." },
  { name: "same-line css comment", input: `초안. /* Daisy motif TL */`, keep: "초안." },
  { name: "same-line unclosed comment", input: `초안. /* Daisy`, keep: "초안." },
  { name: "same-line rgb", input: `초안. rgb(245,240,230)`, keep: "초안." },
  { name: "same-line linear-gradient", input: `초안. linear-gradient(90deg,#F5F0E6,#fff)`, keep: "초안." },
  { name: "tailwind from-to arbitrary", input: `초안.\nfrom-[#F5F0E6] to-[#ffffff]`, keep: "초안." },
  { name: "octal escape tags", input: `진행.\n\\074div class="x"\\076`, keep: "진행." },
  { name: "qwik onclick", input: `초안. onClick$={next}`, keep: "초안." },
  { name: "usemap", input: `초안. usemap="#map"`, keep: "초안." },
  { name: "formaction", input: `초안. formaction="/x"`, keep: "초안." },
  { name: "referrerpolicy", input: `초안. referrerpolicy="no-referrer"`, keep: "초안." },
  { name: "nonce", input: `초안. nonce="abc"`, keep: "초안." },
  { name: "as font", input: `초안. as="font"`, keep: "초안." },
  { name: "type woff2", input: `초안. type="font/woff2"`, keep: "초안." },
  { name: "media print", input: `초안. media="print"`, keep: "초안." },
  { name: "marker-start", input: `초안. marker-start="url(#a)"`, keep: "초안." },
  { name: "paint-order", input: `초안. paint-order="stroke fill"`, keep: "초안." },
  { name: "vector-effect", input: `초안. vector-effect="non-scaling-stroke"`, keep: "초안." },
  { name: "cross-fade", input: `초안.\ncross-fade(url(a.png), url(b.png))`, keep: "초안." },
  { name: "device-cmyk", input: `초안.\ndevice-cmyk(0.2 0.1 0 0)`, keep: "초안." },
  { name: "anchor-name", input: `초안.\nanchor-name: --card`, keep: "초안." },
  { name: "position-anchor", input: `초안.\nposition-anchor: --card`, keep: "초안." },
  { name: "interpolate-size", input: `초안.\ninterpolate-size: allow-keywords`, keep: "초안." },
  { name: "offset-path", input: `초안.\noffset-path: path('M0 0')`, keep: "초안." },
  { name: "mask-image", input: `초안.\nmask-image: url(#m)`, keep: "초안." },
  { name: "same-line scss", input: `초안. $bg: #F5F0E6;`, keep: "초안." },
  { name: "getComputedStyle", input: `진행.\ngetComputedStyle(el)`, keep: "진행." },
  { name: "scrollIntoView", input: `진행.\nel.scrollIntoView()`, keep: "진행." },
  { name: "dataset assign", input: `진행.\nel.dataset.slide = '1'`, keep: "진행." },
  { name: "insertAdjacentText", input: `진행.\nel.insertAdjacentText('beforeend', html)`, keep: "진행." },
  { name: "removeChild", input: `진행.\nroot.removeChild(el)`, keep: "진행." },
  { name: "before after", input: `진행.\nel.before(node)`, keep: "진행." },
  { name: "contain paint", input: `초안.\ncontain: paint`, keep: "초안." },
  { name: "isolation isolate", input: `초안.\nisolation: isolate`, keep: "초안." },
  { name: "mix-blend", input: `초안.\nmix-blend-mode: multiply`, keep: "초안." },
  { name: "keep incomplete p", input: "Text <p", keep: "Text <p" },
  { name: "keep incomplete a", input: "Text <a", keep: "Text <a" },
  { name: "keep incomplete em", input: "Text <em", keep: "Text <em" },
  { name: "keep incomplete https", input: "참고: <https", keep: "참고: <https" },
  { name: "keep visible intro", input: "Visible intro to the deck.", keep: "Visible intro to the deck." },
  { name: "keep markdown", input: "요약.\n# 다음 단계\n- 차트 추가", keep: "요약.\n# 다음 단계\n- 차트 추가" },
  { name: "keep backtick", input: "태그는 `<div>` 형태입니다.", keep: "태그는 `<div>` 형태입니다." },
  { name: "keep autolink", input: "참고: <https://example.com/deck>", keep: "참고: <https://example.com/deck>" },
  { name: "keep dollar amount", input: "예산은 $1200 입니다.", keep: "예산은 $1200 입니다." },
];

describe("chat leak probe round 13 (encoding / framework / cssom / same-line css)", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const out = sanitizeAssistantProseForDisplay(c.input, { stripCodeFences: true });
      expect(out).toBe(c.keep);
    });
  }

  it("keeps a closed question-form for the Questions banner parser", () => {
    const input = `질문\n<question-form id="discovery">{"questions":[{"id":"1"}]}</question-form>`;
    const out = sanitizeAssistantProseForDisplay(input, { stripCodeFences: true });
    expect(out).toContain('<question-form id="discovery">');
    expect(out).toContain("질문");
  });
});
