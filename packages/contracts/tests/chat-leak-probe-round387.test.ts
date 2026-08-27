import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 387 (FOO guillemet separators)", () => {
  it("drops ALLCAPS chrome across » › ≫", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 » XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 › XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ≫ XYZ")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 » XYZ\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
