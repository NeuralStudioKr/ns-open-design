import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 208 (@font-feature-values harden)", () => {
  it("keeps Hangul status when @font-feature-values dump follows", () => {
    expect(looksLikeDeckCodeDebrisLine("@font-feature-values X { opacity: 1 }")).toBe(true);
    expect(
      stripTrailingDeckFrameworkCssLeak(
        "완료.\n\n@font-feature-values X {\n  .a { opacity: 1 }\n}",
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("정리 완료.\n@font-feature-values Y{.z{opacity:0}}", {
        stripCodeFences: true,
      }),
    ).toBe("정리 완료.");
  });
});
