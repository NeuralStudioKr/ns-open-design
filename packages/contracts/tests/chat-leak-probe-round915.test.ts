import { describe, expect, it } from "vitest";
import { looksLikeDeckCodeDebrisLine, sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 915 (FOO ④)", () => {
  it("hides FOO ④ chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ④ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ④ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
  });
});
