import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 249 (@scope harden)", () => {
  it("keeps Hangul status when @scope dump follows", () => {
    expect(looksLikeDeckCodeDebrisLine("@scope (.card) { .x { opacity: 0 } }")).toBe(true);
    expect(
      stripTrailingDeckFrameworkCssLeak(
        "완료.\n\n@scope (.card) {\n  .a { opacity: 1 }\n}",
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("정리 완료.\n@scope {.z{opacity:0}}", {
        stripCodeFences: true,
      }),
    ).toBe("정리 완료.");
  });
});
