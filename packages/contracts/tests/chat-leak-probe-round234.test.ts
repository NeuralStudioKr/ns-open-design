import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 234 (@view-transition harden)", () => {
  it("keeps Hangul status when @view-transition dump follows", () => {
    expect(looksLikeDeckCodeDebrisLine("@view-transition { navigation: auto }")).toBe(true);
    expect(
      stripTrailingDeckFrameworkCssLeak(
        "완료.\n\n@view-transition {\n  .a { opacity: 1 }\n}",
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("정리 완료.\n@view-transition {.z{opacity:0}}", {
        stripCodeFences: true,
      }),
    ).toBe("정리 완료.");
  });
});
