import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

type Case = { name: string; input: string; keep?: string };
const CASES: Case[] = [
  {
    name: "barlow eyebrow",
    input: `초안.\n\n<span style="font-family:'Barlow';font-size:14px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase">Engineering Deep Dive</span>`,
    keep: "초안.",
  },
  {
    name: "plain h1 with style",
    input: `완료.\n<h1 style="font-size:108px;font-weight:900">CLOUD NATIVE</h1>`,
    keep: "완료.",
  },
  {
    name: "orphan closing tags",
    input: `진행.\n</div></div></section>`,
    keep: "진행.",
  },
  {
    name: "br-heavy deck fragment",
    input: `초안.\nCLOUD<br>NATIVE<br>ENGINEERING</h1>`,
    keep: "초안.",
  },
  {
    name: "inline style without tag opener",
    input: `초안.\nfont-family:'Barlow',sans-serif;font-size:14px;letter-spacing:0.18em">Label</span>`,
    keep: "초안.",
  },
  {
    name: "rgba color styled span",
    input: `<span style="color:rgba(245,210,0,0.58);font-size:13px">2024</span>`,
  },
  {
    name: "flex div alone",
    input: `<div style="display:flex;flex-direction:column;gap:32px;justify-content:center">x</div>`,
  },
  {
    name: "grid layout div",
    input: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">a</div>`,
  },
  {
    name: "width 1920 section without slide class",
    input: `<section style="width:1920px;height:1080px;background:#000">Hi</section>`,
  },
  {
    name: "data-deck attributes",
    input: `<div data-deck-active="1" style="opacity:1">Slide</div>`,
  },
  {
    name: "percentage positioned relative deco",
    input: `<div style="top:8%;right:6%;width:22%;position:relative">deco</div>`,
  },
  {
    name: "table deck fragment",
    input: `요약.\n<table style="width:100%"><tr><td style="padding:24px">KPI</td></tr></table>`,
    keep: "요약.",
  },
  {
    name: "ul with inline styles",
    input: `요약.\n<ul style="list-style:none;padding:0"><li style="margin:12px 0">Item</li></ul>`,
    keep: "요약.",
  },
  {
    name: "broken nested quote styles",
    input: `초안.\n<div style="font-size:131 style="font-family:Barlow;font-size:108px">CLOUD</div>`,
    keep: "초안.",
  },
  {
    name: "css custom props mid message",
    input: `초안.\n--bg:#0f172a;--fg:#fff;--accent:#c96442;`,
    keep: "초안.",
  },
  {
    name: "transform translate deco",
    input: `<div style="transform:translate(-50%,-50%);left:50%;top:50%">x</div>`,
  },
  {
    name: "z-index fixed overlay",
    input: `<div style="z-index:999;position:fixed;inset:0">overlay</div>`,
  },
  {
    name: "img tag deck",
    input: `참고.\n<img src="motif.svg" style="position:absolute;width:22%" />`,
    keep: "참고.",
  },
  {
    name: "button chrome",
    input: `<button style="border-radius:9999px;padding:12px 28px;font-family:Barlow">Next</button>`,
  },
  {
    name: "mixed prose then html then prose",
    input: `좋아요.\n<span style="font-family:Barlow;letter-spacing:0.2em">TAG</span>\n추가 설명은 여기.`,
    keep: "좋아요.",
  },
  {
    name: "user report full barlow block",
    input: [
      `<span style="font-family:'Barlow','Noto Sans SC',sans-serif;font-size:14px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(245,210,0,0.58)">Engineering Deep Dive</span>`,
      `<span style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:rgba(245,210,0,0.4)">2024</span>`,
      `</div> <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:32px;">`,
      `<div style="font-family:'Barlow','Noto Sans SC',sans-serif;font-size:131 style="font-family:'Barlow','Noto Sans SC',sans-serif;font-size:108px;font-weight:900;line-height:0.95;margin:0;text-transform:uppercase;letter-spacing:-2px">CLOUD<br>NATIVE<br>ENGINEERING</h1>`,
      ``,
      `슬라이드 추가 중ospace;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.5;margin-bottom:18px">Observability in Depth</div>`,
    ].join("\n"),
  },
  {
    name: "strong em with deck styles",
    input: `메모.\n<strong style="font-size:64px;letter-spacing:-2px">TITLE</strong>`,
    keep: "메모.",
  },
  {
    name: "footer chrome",
    input: `<footer style="position:absolute;bottom:48px;left:64px;font-size:14px">1 / 12</footer>`,
  },
  {
    name: "header chrome",
    input: `<header style="display:flex;justify-content:space-between;padding:32px">logo</header>`,
  },
  {
    name: "nav chrome",
    input: `<nav style="position:absolute;right:40px;top:40px">menu</nav>`,
  },
];

function looksLikeDeckDebris(out: string): boolean {
  return /<\/?[a-zA-Z]|style\s*=|font-family\s*:|display\s*:\s*(?:flex|grid)|width\s*:\s*1920|letter-spacing\s*:|text-transform\s*:|--[a-zA-Z_][\w-]*\s*:/i.test(
    out,
  );
}

describe("chat leak probe matrix", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const out = sanitizeAssistantProseForDisplay(c.input, { stripCodeFences: true });
      if (c.keep !== undefined) {
        expect(out).toBe(c.keep);
      } else {
        expect(out.trim()).toBe("");
      }
      expect(looksLikeDeckDebris(out)).toBe(false);
    });
  }
});
