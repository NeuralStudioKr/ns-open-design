import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 192 (@document harden regression)", () => {
  it("keeps Hangul status when @document dump follows", () => {
    expect(looksLikeDeckCodeDebrisLine("@document url(https://x.test/) { opacity: 1 }")).toBe(true);
    expect(
      stripTrailingDeckFrameworkCssLeak(
        "완료.\n\n@document url-prefix() {\n  .a { opacity: 1 }\n}",
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("정리 완료.\n@document url-prefix(){.z{opacity:0}}", {
        stripCodeFences: true,
      }),
    ).toBe("정리 완료.");
  });
});
