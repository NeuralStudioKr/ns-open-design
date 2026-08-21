import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

type Case = { name: string; input: string; keep?: string };

const CASES: Case[] = [
  // Round-1 survivors / regression guards
  {
    name: "single-line barlow last-line",
    input: `초안.\n\n<span style="font-family:'Barlow';font-size:14px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase">Engineering Deep Dive</span>`,
    keep: "초안.",
  },
  {
    name: "streaming preserveClosedArtifact still strips prose chrome",
    input: `진행.\n<span style="font-family:Barlow;letter-spacing:0.2em">TAG</span>`,
    keep: "진행.",
  },
  // New adversarial families
  {
    name: "role=presentation slide shell",
    input: `요약.\n<div role="presentation" style="width:100%;height:100%">deck</div>`,
    keep: "요약.",
  },
  {
    name: "aria-hidden deco",
    input: `요약.\n<div aria-hidden="true" style="position:absolute;inset:0;pointer-events:none">deco</div>`,
    keep: "요약.",
  },
  {
    name: "class slide without data-slide",
    input: `요약.\n<section class="slide active" style="background:#111">Title</section>`,
    keep: "요약.",
  },
  {
    name: "data-screen-label host",
    input: `요약.\n<section class="slide" data-screen-label="01 Cover" style="padding:64px">Hi</section>`,
    keep: "요약.",
  },
  {
    name: "video poster chrome",
    input: `참고.\n<video style="width:100%;object-fit:cover" poster="cover.jpg"></video>`,
    keep: "참고.",
  },
  {
    name: "canvas element",
    input: `참고.\n<canvas width="1920" height="1080" style="display:block"></canvas>`,
    keep: "참고.",
  },
  {
    name: "iframe embed",
    input: `참고.\n<iframe src="about:blank" style="border:0;width:100%;height:100%"></iframe>`,
    keep: "참고.",
  },
  {
    name: "style tag body only no closer",
    input: `진행.\n<style>.slide{width:1920px;height:1080px}`,
    keep: "진행.",
  },
  {
    name: "bare css rule .slide{",
    input: `진행.\n.slide{width:1920px;height:1080px;background:#000}`,
    keep: "진행.",
  },
  {
    name: "partial class selector deco",
    input: `진행.\n.deco-orb{position:absolute;top:-8%;right:6%}`,
    keep: "진행.",
  },
  {
    name: "linear-gradient background div",
    input: `<div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:48px">Hero</div>`,
  },
  {
    name: "clip-path deco",
    input: `<div style="clip-path:polygon(0 0,100% 0,100% 80%,0 100%);background:#c96442">shape</div>`,
  },
  {
    name: "mix-blend-mode overlay",
    input: `<div style="mix-blend-mode:multiply;opacity:0.4;position:absolute;inset:0">overlay</div>`,
  },
  {
    name: "object-fit image without motif src",
    input: `참고.\n<img src="https://cdn.example.com/hero.png" style="object-fit:cover;width:100%;height:100%" />`,
    keep: "참고.",
  },
  {
    name: "figure figcaption chrome",
    input: `요약.\n<figure style="margin:0"><figcaption style="font-size:12px;letter-spacing:0.1em">CAPTION</figcaption></figure>`,
    keep: "요약.",
  },
  {
    name: "markdown-looking but real html p",
    input: `좋아요.\n<p style="font-size:18px;line-height:1.6;margin:0 64px">본문 카피</p>`,
    keep: "좋아요.",
  },
  {
    name: "hangul glued br stack",
    input: `제목 넣는 중CLOUD<br>NATIVE<br>ENGINEERING</h1>`,
    keep: "제목 넣는 중",
  },
  {
    name: "multiple orphan closes after prose",
    input: `완료했습니다.\n</span></div></section></div>`,
    keep: "완료했습니다.",
  },
  {
    name: "template literal css var mid",
    input: `초안.\ncolor:var(--accent);background:var(--bg);font-size:14px">Label</div>`,
    keep: "초안.",
  },
  {
    name: "webkit backdrop filter",
    input: `<div style="-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-radius:24px">glass</div>`,
  },
  {
    name: "keyframes name without at-rule opener truncated",
    input: `진행.\nto{transform:rotate(360deg);opacity:0}`,
    keep: "진행.",
  },
  {
    name: "srcset picture",
    input: `참고.\n<picture><source srcset="a.webp"><img src="a.jpg" style="width:100%"></picture>`,
    keep: "참고.",
  },
  {
    name: "contenteditable false chrome",
    input: `<div contenteditable="false" style="font-family:Barlow;font-size:48px;font-weight:900">TITLE</div>`,
  },
  {
    name: "user report mixed reload block again",
    input: [
      "초안을 다듬는 중입니다.",
      "",
      `<span style="font-family:'Barlow','Noto Sans SC',sans-serif;font-size:14px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(245,210,0,0.58)">Engineering Deep Dive</span>`,
      `</div> <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:32px;">`,
      `슬라이드 추가 중ospace;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.5;margin-bottom:18px">Observability in Depth</div>`,
    ].join("\n"),
    keep: "초안을 다듬는 중입니다.\n슬라이드 추가 중",
  },
];

function looksLikeDeckDebris(out: string): boolean {
  return /<\/?[a-zA-Z]|style\s*=|font-family\s*:|display\s*:\s*(?:flex|grid)|width\s*:\s*1920|letter-spacing\s*:|text-transform\s*:|--[a-zA-Z_][\w-]*\s*:|linear-gradient|clip-path|backdrop-filter|object-fit/i.test(
    out,
  );
}

describe("chat leak probe round 2", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const out = sanitizeAssistantProseForDisplay(c.input, { stripCodeFences: true });
      const streamingOut = sanitizeAssistantProseForDisplay(c.input, {
        stripCodeFences: true,
        streaming: true,
      });
      if (c.keep !== undefined) {
        expect(out).toBe(c.keep);
        // Streaming may preserve more only inside artifacts; chrome prose should still scrub.
        expect(looksLikeDeckDebris(streamingOut)).toBe(false);
      } else {
        expect(out.trim()).toBe("");
      }
      expect(looksLikeDeckDebris(out)).toBe(false);
    });
  }
});
