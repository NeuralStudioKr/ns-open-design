import { describe, expect, it } from "vitest";
import { looksLikeDeckCodeDebrisLine, sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 919 (FOO ⑧)", () => {
  it("hides FOO ⑧ chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ⑧ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ⑧ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
  });
});
