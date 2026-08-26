import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 145 (colon/pipe/slash generic keep)", () => {
  it("still drops : | / ALLCAPS chrome and keeps Hangul", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 : XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 | XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 / XYZ")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 / XYZ\n슬라이드 정리 완료", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 정리 완료");
  });
});
