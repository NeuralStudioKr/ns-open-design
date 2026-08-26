import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 114 (fullwidth middle-dot chrome)", () => {
  it("drops FOO chrome with katakana/halfwidth middle dots", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ・ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARABC 2 ･ ABC")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ・ XYZ\n트랙 정리 완료", {
        stripCodeFences: true,
      }),
    ).toBe("트랙 정리 완료");
    expect(
      sanitizeAssistantProseForDisplay("BARABC 2 ･ ABC\n진행 중입니다", {
        stripCodeFences: true,
      }),
    ).toBe("진행 중입니다");
  });

  it("keeps Hangul prose that mentions middle dots", () => {
    expect(
      sanitizeAssistantProseForDisplay("중간점 ・ 기호는 본문에 남겨 둡니다.", {
        stripCodeFences: true,
      }),
    ).toBe("중간점 ・ 기호는 본문에 남겨 둡니다.");
  });
});
