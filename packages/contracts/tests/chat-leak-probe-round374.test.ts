import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 374 (FOO keep Hangul)", () => {
  it("keeps Hangul when FOO equals chrome is stripped", () => {
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 = XYZ\n슬라이드 정리 완료", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 정리 완료");
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
  });
});
