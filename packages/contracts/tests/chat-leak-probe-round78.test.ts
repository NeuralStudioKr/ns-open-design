import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 78 (@scroll-state)", () => {
  it("scrubs @scroll-state dumps with or without space before brace", () => {
    expect(looksLikeDeckCodeDebrisLine("@scroll-state scrollable{}")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@scroll-state scrollable { .x{color:red} }")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("완료.\n@scroll-state scrollable{}", {
        stripCodeFences: true,
      }),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("진행.\n@scroll-state scrollable { .x{} }", {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
  });
});
