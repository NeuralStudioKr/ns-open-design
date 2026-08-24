import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 4 — unknown utility dumps / mid-message islands / entity crumbs.
 * Heuristic line scrub must catch these without a named DECK_* regex.
 */
const CASES: Array<{ name: string; input: string; keep?: string }> = [
  {
    name: "triple compound unknown class",
    input: "요약.\n.foo.bar.baz{opacity:0.42;transform:translateY(4px)}",
    keep: "요약.",
  },
  {
    name: "id selector dump",
    input: "메모.\n#hero-kicker{letter-spacing:0.2em;color:#c96442}",
    keep: "메모.",
  },
  {
    name: "supports fragment",
    input: "진행.\n@supports (backdrop-filter:blur(8px)){.glass{backdrop-filter:blur(8px)}}",
    keep: "진행.",
  },
  {
    name: "hex close residue after style cut",
    input: `#2D2D2D">Internal Team</span>`,
  },
  {
    name: "orphan style close",
    input: "완료.\n</style>",
    keep: "완료.",
  },
  {
    name: "custom prop split after lead",
    input: [
      "진행합니다.",
      ":root{",
      "--bg:",
      "#1A1A1A;--coral:",
      "#8BB4F7}",
    ].join("\n"),
    keep: "진행합니다.",
  },
  {
    name: "css island between two hangul paragraphs",
    input: [
      "레이아웃을 정리했습니다.",
      ".chip.on{padding:4px 12px;background:rgba(0,0,0,0.08)}",
      "차트 슬라이드를 이어서 만들까요?",
    ].join("\n"),
    keep: "레이아웃을 정리했습니다.\n차트 슬라이드를 이어서 만들까요?",
  },
  {
    name: "truncated at-rule stop alone",
    input: "초안.\nfrom{opacity:0;transform:translateY(12px)}",
    keep: "초안.",
  },
  {
    name: "entity-encoded span style",
    input: "메모.\n&lt;span style=&quot;font-family:Barlow;letter-spacing:0.2em&quot;&gt;TAG&lt;/span&gt;",
    keep: "메모.",
  },
  {
    name: "markdown heading preserved",
    input: "요약.\n# 다음 단계\n본문입니다.",
    keep: "요약.\n# 다음 단계\n본문입니다.",
  },
];

function looksLikeDeckDebris(out: string): boolean {
  return /<\/?[a-zA-Z]|style\s*=|font-family\s*:|display\s*:\s*(?:flex|grid)|width\s*:\s*1920|letter-spacing\s*:|text-transform\s*:|--[a-zA-Z_][\w-]*\s*:|rgba?\(|hsla?\(|(?:^|\n)\s*[.#@][\w.-]*\s*\{/i.test(
    out,
  );
}

describe("chat leak probe round 4 (heuristic catch-all)", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const out = sanitizeAssistantProseForDisplay(c.input, { stripCodeFences: true });
      if (c.keep !== undefined) {
        expect(out).toBe(c.keep);
      } else {
        expect(out.trim()).toBe("");
      }
      expect(looksLikeDeckDebris(out)).toBe(false);
      const streamingOut = sanitizeAssistantProseForDisplay(c.input, {
        stripCodeFences: true,
        streaming: true,
      });
      expect(looksLikeDeckDebris(streamingOut)).toBe(false);
    });
  }
});
