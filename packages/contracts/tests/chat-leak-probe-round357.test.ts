import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 357 (FOO keep prose)", () => {
  it("keeps mixed-case step labels and Hangul status", () => {
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(looksLikeDeckCodeDebrisLine("Next → Continue")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("Step 1: Setup\n진행 중입니다.", {
        stripCodeFences: true,
      }),
    ).toContain("Step 1: Setup");
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 = XYZ\n완료", {
        stripCodeFences: true,
      }),
    ).toBe("완료");
  });
});
