import { describe, expect, it } from "vitest";
import {
  sanitizeAssistantProseForDisplay,
  stripResidualDeckHtmlMarkupFromProse,
} from "../src/agent-prose-sanitize.js";

/**
 * Round 5 — structural residual HTML scrub so unknown deck dialects cannot
 * re-enter the bubble after the named scrapers miss them.
 */
const CASES: Array<{ name: string; input: string; keep?: string }> = [
  {
    name: "single-line glued li dump after Hangul",
    input: `초안. <li>1차: 객관식 100문항</li><li>2차: 단답형 60문항</li>`,
    keep: "초안.",
  },
  {
    name: "table row dump",
    input: `메모.\n<table><tr><td>과목</td><td>배점</td></tr><tr><td>커널</td><td>20</td></tr></table>`,
    keep: "메모.",
  },
  {
    name: "entity-encoded li",
    input: `진행.\n&lt;li&gt;공공기관 가산점&lt;/li&gt;`,
    keep: "진행.",
  },
  {
    name: "ul/ol wrapper without leading style",
    input: `<ul><li>CentOS 실습</li><li>Bash 자동화</li></ul>`,
  },
  {
    name: "inline comment glued to status",
    input: `정리 중 <!-- Left: intro --> <div>2급</p>`,
    keep: "정리 중",
  },
  {
    name: "zhangzara fragments without newlines",
    input: `<!-- Col 1 --> <li><strong>기본 명령어</strong>: ls, cp</li> LEVEL</p>`,
  },
  {
    name: "markdown still intact",
    input: "요약.\n# 다음 단계\n- 차트 추가\n- 표 정리",
    keep: "요약.\n# 다음 단계\n- 차트 추가\n- 표 정리",
  },
  {
    name: "backtick html mention preserved",
    input: "태그는 `<li>` 형태입니다.",
    keep: "태그는 `<li>` 형태입니다.",
  },
];

function looksLikeDeckDebris(out: string): boolean {
  return /<\/?[a-zA-Z]|<!--|-->|<li\b|<div\b|<table\b|&lt;li/i.test(out);
}

describe("chat leak probe round 5 (residual HTML scrub)", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const out = sanitizeAssistantProseForDisplay(c.input, { stripCodeFences: true });
      if (c.keep !== undefined) {
        expect(out).toBe(c.keep);
      } else {
        expect(out.trim()).toBe("");
      }
      if (!c.name.includes("backtick") && !c.name.includes("markdown")) {
        expect(looksLikeDeckDebris(out)).toBe(false);
      }
    });
  }

  it("stripResidualDeckHtmlMarkupFromProse is idempotent on clean Hangul", () => {
    const prose = "초안을 다듬는 중입니다.\n\n슬라이드 2장을 더 추가할까요?";
    expect(stripResidualDeckHtmlMarkupFromProse(prose)).toBe(prose);
  });
});
