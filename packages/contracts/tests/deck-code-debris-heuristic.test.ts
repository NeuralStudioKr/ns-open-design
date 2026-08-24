import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripLeakedDeckCodeDebrisBlocks,
} from "../src/agent-prose-sanitize.js";

describe("heuristic deck code debris scrub", () => {
  it("classifies .tag.inv and unknown utility rules as debris", () => {
    expect(
      looksLikeDeckCodeDebrisLine(
        ".tag.inv{border-color:rgba(28,28,28,0.35);color:",
      ),
    ).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("#1c1c1c}")).toBe(false); // continuation helper
    expect(looksLikeDeckCodeDebrisLine(".chip.on{padding:4px 10px;background:#eee}")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine(".foo.bar.baz{opacity:0.5}")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("# Title heading")).toBe(false);
    expect(looksLikeDeckCodeDebrisLine("초안을 다듬는 중입니다.")).toBe(false);
    expect(looksLikeDeckCodeDebrisLine("- border-color can help")).toBe(false);
  });

  it("strips user-reported .tag.inv multi-line dump", () => {
    const frag = `.tag.inv{border-color:rgba(28,28,28,0.35);color:
#1c1c1c}`;
    expect(sanitizeAssistantProseForDisplay(frag).trim()).toBe("");
    expect(sanitizeAssistantProseForDisplay(`초안.\n${frag}`)).toBe("초안.");
    expect(sanitizeAssistantProseForDisplay(`진행 중.\n\n${frag}`)).toBe("진행 중.");
  });

  it("strips unknown compound classes without a named regex", () => {
    const dumps = [
      `.badge.soft{background:rgba(0,0,0,0.06);border-radius:999px}`,
      `.kicker.sm{letter-spacing:0.18em;text-transform:uppercase}`,
      `.card.elev{box-shadow:0 12px 40px rgba(0,0,0,0.2);padding:24px}`,
      `.nav.dot.active{background:#c96442;width:10px;height:10px}`,
    ];
    for (const d of dumps) {
      expect(sanitizeAssistantProseForDisplay(`요약.\n${d}`)).toBe("요약.");
      expect(sanitizeAssistantProseForDisplay(d).trim()).toBe("");
    }
  });

  it("strips mixed CSS islands but keeps surrounding Hangul prose", () => {
    const input = [
      "레이아웃을 정리했습니다.",
      "",
      ".tag.inv{border-color:rgba(28,28,28,0.35);color:",
      "#1c1c1c}",
      ".pill{border-radius:9999px;padding:6px 12px}",
      "",
      "이어서 차트 슬라이드를 만들까요?",
    ].join("\n");
    expect(sanitizeAssistantProseForDisplay(input)).toBe(
      "레이아웃을 정리했습니다.\n\n이어서 차트 슬라이드를 만들까요?",
    );
  });

  it("does not strip markdown headings or normal lists", () => {
    expect(
      sanitizeAssistantProseForDisplay("요약.\n# 다음 단계\n- 차트 추가"),
    ).toBe("요약.\n# 다음 단계\n- 차트 추가");
  });

  it("stripLeakedDeckCodeDebrisBlocks is idempotent on clean prose", () => {
    const prose = "초안을 다듬는 중입니다.\n\n슬라이드 2장을 더 추가할까요?";
    expect(stripLeakedDeckCodeDebrisBlocks(prose)).toBe(prose);
  });

  it("keeps prose lead when closed artifact is preserved", () => {
    const input = [
      "진행.",
      '<artifact identifier="deck" type="text/html">',
      "<style>.tag.inv{color:#1c1c1c}</style>",
      "</artifact>",
    ].join("\n");
    const out = sanitizeAssistantProseForDisplay(input, {
      preserveClosedArtifact: true,
    });
    expect(out.startsWith("진행.")).toBe(true);
    expect(out).toContain("<artifact");
    // Outside the artifact, utility CSS must not leak as chat copy.
    expect(out.replace(/<artifact[\s\S]*?<\/artifact>/i, "")).not.toMatch(/\.tag\.inv/);
  });
});
