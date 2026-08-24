import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

type Case = { name: string; input: string; keep?: string };

const CASES: Case[] = [
  // Prior round guards
  {
    name: "barlow single-line",
    input: `초안.\n\n<span style="font-family:'Barlow';font-size:14px;letter-spacing:0.18em;text-transform:uppercase">TAG</span>`,
    keep: "초안.",
  },
  {
    name: "linear-gradient",
    input: `<div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:48px">Hero</div>`,
  },
  // Round 3 — new families
  {
    name: "mask-image deco",
    input: `<div style="mask-image:radial-gradient(circle,black,transparent);-webkit-mask-image:radial-gradient(circle,black,transparent)">x</div>`,
  },
  {
    name: "filter blur deco",
    input: `<div style="filter:blur(40px);opacity:0.5;position:absolute;inset:-10%">glow</div>`,
  },
  {
    name: "box-shadow only card",
    input: `<div style="box-shadow:0 24px 80px rgba(0,0,0,0.35);border-radius:16px;padding:32px">Card</div>`,
  },
  {
    name: "aspect-ratio media frame",
    input: `요약.\n<div style="aspect-ratio:16/9;width:100%;overflow:hidden">frame</div>`,
    keep: "요약.",
  },
  {
    name: "object tag embed",
    input: `참고.\n<object data="motif.svg" type="image/svg+xml" style="width:22%"></object>`,
    keep: "참고.",
  },
  {
    name: "embed tag",
    input: `참고.\n<embed src="deco.svg" type="image/svg+xml" style="position:absolute;top:8%">`,
    keep: "참고.",
  },
  {
    name: "progress meter chrome",
    input: `<div style="height:6px;width:100%;background:#222;border-radius:999px"><div style="width:62%;height:100%;background:#c96442"></div></div>`,
  },
  {
    name: "data-uri background",
    input: `<div style="background-image:url(data:image/svg+xml;base64,PHN2Zy);background-size:cover">bg</div>`,
  },
  {
    name: "css content attr pseudo dump",
    input: `진행.\n.deco-orb::before{content:"";position:absolute;inset:0}`,
    keep: "진행.",
  },
  {
    name: "animation shorthand dump",
    input: `진행.\nanimation:deco-spin 12s linear infinite;transform-origin:center`,
    keep: "진행.",
  },
  {
    name: "will-change transform shell",
    input: `<div style="will-change:transform;transform:translate3d(0,0,0);backface-visibility:hidden">layer</div>`,
  },
  {
    name: "grid-template-areas layout",
    input: `<div style="display:grid;grid-template-areas:'a b' 'c c';gap:24px">layout</div>`,
  },
  {
    name: "column-count magazine",
    input: `<div style="column-count:2;column-gap:48px;font-size:18px">body copy</div>`,
  },
  {
    name: "writing-mode vertical",
    input: `<div style="writing-mode:vertical-rl;letter-spacing:0.2em;font-size:14px">SIDE</div>`,
  },
  {
    name: "mathml fragment",
    input: `요약.\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>`,
    keep: "요약.",
  },
  {
    name: "foreignObject leftover",
    input: `도형.\n<foreignObject x="0" y="0" width="200" height="80"><div style="font-size:24px">Hi</div></foreignObject>`,
    keep: "도형.",
  },
  {
    name: "use href svg leftover",
    input: `도형.\n<use href="#motif" xlink:href="#motif"></use>`,
    keep: "도형.",
  },
  {
    name: "style attr with template literals escaped",
    input: `초안.\n<span style=\\"font-family:Barlow;font-size:64px;font-weight:900\\">TITLE</span>`,
    keep: "초안.",
  },
  {
    name: "html entity styled span",
    input: `초안.\n&lt;span style="font-family:Barlow;letter-spacing:0.2em"&gt;TAG&lt;/span&gt;`,
    keep: "초안.",
  },
  {
    name: "markdown html comment deco",
    input: `진행.\n<!-- slide: 03 metrics -->\n<div class="deco-orb">`,
    keep: "진행.",
  },
  {
    name: "viewport meta leftover mid prose",
    input: `진행.\n<meta name="viewport" content="width=device-width,initial-scale=1">`,
    keep: "진행.",
  },
  {
    name: "link stylesheet leftover",
    input: `진행.\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow">`,
    keep: "진행.",
  },
  {
    name: "nested quotes button pill",
    input: `<button style="font-family:'Space Grotesk',sans-serif;border-radius:9999px;padding:12px 28px">Next</button>`,
  },
  {
    name: "streaming path chrome",
    input: `작성 중.\n<section class="slide" data-screen-label="02" style="padding:64px">Body</section>`,
    keep: "작성 중.",
  },
];

function looksLikeDeckDebris(out: string): boolean {
  return /<\/?[a-zA-Z]|style\s*=|font-family\s*:|display\s*:\s*(?:flex|grid)|width\s*:\s*1920|letter-spacing\s*:|text-transform\s*:|linear-gradient|clip-path|backdrop-filter|object-fit|box-shadow\s*:|aspect-ratio\s*:|filter\s*:|animation\s*:|writing-mode\s*:|column-count\s*:|will-change\s*:|mask-image\s*:|foreignObject|&lt;span/i.test(
    out,
  );
}

describe("chat leak probe round 3", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const out = sanitizeAssistantProseForDisplay(c.input, { stripCodeFences: true }).trimEnd();
      if (c.keep !== undefined) {
        expect(out).toBe(c.keep);
      } else {
        expect(out.trim()).toBe("");
      }
      expect(looksLikeDeckDebris(out)).toBe(false);
    });
  }
});
