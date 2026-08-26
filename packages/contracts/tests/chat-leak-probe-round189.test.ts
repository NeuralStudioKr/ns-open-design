import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 189 (@document opacity dump)", () => {
  it("cuts @document dumps that only set opacity", () => {
    expect(looksLikeDeckCodeDebrisLine("@document url-prefix() { .x{opacity:0} }")).toBe(true);
    const dumped = stripTrailingDeckFrameworkCssLeak(
      "슬라이드 정리 완료.\n\n@document url-prefix() {\n  .hero { opacity: 0 }\n}",
    );
    expect(dumped).toBe("슬라이드 정리 완료.");
    const out = sanitizeAssistantProseForDisplay(
      "진행 중입니다.\n\n@document domain(example.com) {\n  .badge { opacity: .3 }\n}",
      { stripCodeFences: true },
    );
    expect(out).toBe("진행 중입니다.");
    expect(out).not.toMatch(/@document/i);
  });
});
