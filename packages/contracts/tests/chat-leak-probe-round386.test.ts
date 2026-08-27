import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 386 (FOO fullwidth colon)", () => {
  it("drops ALLCAPS chrome with fullwidth colon", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ： XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ： XYZ\n트랙 정리 완료", {
        stripCodeFences: true,
      }),
    ).toBe("트랙 정리 완료");
  });
});
