import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 203 (@font-feature-values opacity dump)", () => {
  it("cuts @font-feature-values dumps that only set opacity", () => {
    expect(looksLikeDeckCodeDebrisLine("@font-feature-values Fancy { .x{opacity:0} }")).toBe(true);
    const dumped = stripTrailingDeckFrameworkCssLeak(
      "슬라이드 정리 완료.\n\n@font-feature-values Fancy {\n  .hero { opacity: 0 }\n}",
    );
    expect(dumped).toBe("슬라이드 정리 완료.");
    const out = sanitizeAssistantProseForDisplay(
      "진행 중입니다.\n\n@font-feature-values Demo {\n  .badge { opacity: .15 }\n}",
      { stripCodeFences: true },
    );
    expect(out).toBe("진행 중입니다.");
    expect(out).not.toMatch(/@font-feature-values/i);
  });
});
