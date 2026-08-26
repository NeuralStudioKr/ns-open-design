import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 103 (@scroll-state framework harden)", () => {
  it("cuts @scroll-state dumps even when only opacity rules appear", () => {
    expect(looksLikeDeckCodeDebrisLine("@scroll-state scrolled { .x{opacity:1} }")).toBe(true);
    const dumped = stripTrailingDeckFrameworkCssLeak(
      "슬라이드 정리 완료.\n\n@scroll-state scrolled {\n  .hero { opacity: 1 }\n}",
    );
    expect(dumped).toBe("슬라이드 정리 완료.");
    const out = sanitizeAssistantProseForDisplay(
      "진행 중입니다.\n\n@scroll-state sticky {\n  .badge { opacity: .5 }\n}",
      { stripCodeFences: true },
    );
    expect(out).toBe("진행 중입니다.");
    expect(out).not.toMatch(/@scroll-state/i);
  });
});
