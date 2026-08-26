import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 159 (@nest opacity dump)", () => {
  it("cuts @nest dumps that only set opacity", () => {
    expect(looksLikeDeckCodeDebrisLine("@nest .x { opacity: 0 }")).toBe(true);
    const dumped = stripTrailingDeckFrameworkCssLeak(
      "슬라이드 정리 완료.\n\n@nest .hero {\n  opacity: 0\n}",
    );
    expect(dumped).toBe("슬라이드 정리 완료.");
    const out = sanitizeAssistantProseForDisplay(
      "진행 중입니다.\n\n@nest .badge {\n  opacity: .25\n}",
      { stripCodeFences: true },
    );
    expect(out).toBe("진행 중입니다.");
    expect(out).not.toMatch(/@nest/i);
  });
});
