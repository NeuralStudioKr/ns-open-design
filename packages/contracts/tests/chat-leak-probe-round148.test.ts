import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 148 (@function harden regression)", () => {
  it("keeps Hangul status when @function dump follows", () => {
    expect(looksLikeDeckCodeDebrisLine("@function --x() { opacity: 1 }")).toBe(true);
    expect(
      stripTrailingDeckFrameworkCssLeak(
        "완료.\n\n@function --x() {\n  .a { opacity: 1 }\n}",
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("정리 완료.\n@function --y(){.z{opacity:0}}", {
        stripCodeFences: true,
      }),
    ).toBe("정리 완료.");
  });
});
