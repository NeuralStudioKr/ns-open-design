import { describe, expect, it } from "vitest";
import { looksLikeDeckCodeDebrisLine, sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 917 (FOO ⑥)", () => {
  it("hides FOO ⑥ chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ⑥ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ⑥ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
  });
});
