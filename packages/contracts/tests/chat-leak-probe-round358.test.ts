import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 358 (@import harden)", () => {
  it("cuts trailing @import dumps after Hangul status", () => {
    expect(looksLikeDeckCodeDebrisLine('@import url("https://example.com/x.css");')).toBe(true);
    expect(
      stripTrailingDeckFrameworkCssLeak(
        '완료.\n\n@import url("https://example.com/deck.css");',
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay(
        '정리 완료.\n@import url("https://fonts.googleapis.com/css2?family=X");',
        { stripCodeFences: true },
      ),
    ).toBe("정리 완료.");
  });
});
