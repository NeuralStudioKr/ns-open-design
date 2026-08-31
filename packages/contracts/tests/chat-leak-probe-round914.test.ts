import { describe, expect, it } from "vitest";
import { looksLikeDeckCodeDebrisLine, sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 914 (FOO ③)", () => {
  it("hides FOO ③ chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ③ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ③ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
  });
});
