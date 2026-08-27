import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 388 (@when harden)", () => {
  it("keeps Hangul status when @when dump follows", () => {
    expect(looksLikeDeckCodeDebrisLine("@when (style(--x: 1)) { .x{opacity:0} }")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay(
        "완료.\n\n@when (style(--x: 1)) {\n  .a { opacity: 1 }\n}",
        { stripCodeFences: true },
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("정리 완료.\n@when (style(--x:1)) {.z{opacity:0}}", {
        stripCodeFences: true,
      }),
    ).toBe("정리 완료.");
  });
});
