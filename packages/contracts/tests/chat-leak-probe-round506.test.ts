import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 506 (@when keep)", () => {
  it("still hardens @when", () => {
    expect(looksLikeDeckCodeDebrisLine("@when (style(--x: 1)) { .x{opacity:0} }")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("완료.\n\n@when (style(--x: 1)) {\n  .a { opacity: 1 }\n}", {
        stripCodeFences: true,
      }),
    ).toBe("완료.");
  });
});
