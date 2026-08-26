import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 118 (@starting-style opacity dump)", () => {
  it("cuts @starting-style dumps that only set opacity", () => {
    expect(looksLikeDeckCodeDebrisLine("@starting-style { .x{opacity:0} }")).toBe(true);
    const dumped = stripTrailingDeckFrameworkCssLeak(
      "슬라이드 정리 완료.\n\n@starting-style {\n  .hero { opacity: 0 }\n}",
    );
    expect(dumped).toBe("슬라이드 정리 완료.");
    const out = sanitizeAssistantProseForDisplay(
      "진행 중입니다.\n\n@starting-style {\n  .badge { opacity: .2 }\n}",
      { stripCodeFences: true },
    );
    expect(out).toBe("진행 중입니다.");
    expect(out).not.toMatch(/@starting-style/i);
  });
});
