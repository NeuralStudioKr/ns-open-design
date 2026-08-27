import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 389 (@else harden)", () => {
  it("keeps Hangul status when @else dump follows", () => {
    expect(looksLikeDeckCodeDebrisLine("@else { .x{opacity:0} }")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("완료.\n\n@else {\n  .a { opacity: 1 }\n}", {
        stripCodeFences: true,
      }),
    ).toBe("완료.");
  });
});
