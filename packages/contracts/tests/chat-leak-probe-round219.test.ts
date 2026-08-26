import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 219 (@charset opacity dump)", () => {
  it("cuts @charset dumps that only set opacity", () => {
    expect(looksLikeDeckCodeDebrisLine('@charset "UTF-8";')).toBe(true);
    const dumped = stripTrailingDeckFrameworkCssLeak(
      "슬라이드 정리 완료.\n\n@charset {\n  .hero { opacity: 0 }\n}",
    );
    expect(dumped).toBe("슬라이드 정리 완료.");
    const out = sanitizeAssistantProseForDisplay(
      "진행 중입니다.\n\n@charset {\n  .badge { opacity: .2 }\n}",
      { stripCodeFences: true },
    );
    expect(out).toBe("진행 중입니다.");
    expect(out).not.toMatch(/@charset/i);
  });
});
