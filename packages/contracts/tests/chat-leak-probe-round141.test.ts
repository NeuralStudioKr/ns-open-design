import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 141 (slash chrome separators)", () => {
  it("drops FOO chrome with / and fullwidth ／", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 / XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARABC 2 ／ ABC")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 / XYZ\n트랙 정리 완료", {
        stripCodeFences: true,
      }),
    ).toBe("트랙 정리 완료");
    expect(
      sanitizeAssistantProseForDisplay("BARABC 2 ／ ABC\n진행 중입니다", {
        stripCodeFences: true,
      }),
    ).toBe("진행 중입니다");
  });

  it("keeps mixed-case prose with slash", () => {
    expect(looksLikeDeckCodeDebrisLine("Step 1 / Setup guide")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("Step 1 / Setup guide", {
        stripCodeFences: true,
      }),
    ).toBe("Step 1 / Setup guide");
  });
});
