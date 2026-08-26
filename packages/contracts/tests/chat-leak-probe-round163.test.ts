import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 163 (@nest harden regression)", () => {
  it("keeps Hangul status when @nest dump follows", () => {
    expect(looksLikeDeckCodeDebrisLine("@nest .a { opacity: 1 }")).toBe(true);
    expect(
      stripTrailingDeckFrameworkCssLeak(
        "완료.\n\n@nest .card {\n  .x { opacity: 1 }\n}",
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("정리 완료.\n@nest .z{opacity:0}", {
        stripCodeFences: true,
      }),
    ).toBe("정리 완료.");
  });
});
