import { describe, expect, it } from "vitest";
import { looksLikeDeckCodeDebrisLine, sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 912 (FOO ①)", () => {
  it("hides FOO ① chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ① XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ① XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
  });
});
