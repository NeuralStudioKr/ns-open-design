import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 89 (@scroll-state dump cutter)", () => {
  it("strips trailing @scroll-state CSS dumps after Hangul status", () => {
    expect(looksLikeDeckCodeDebrisLine("@scroll-state scrolled { .x{opacity:1} }")).toBe(true);
    const out = sanitizeAssistantProseForDisplay(
      "슬라이드 정리 완료.\n\n@scroll-state scrolled {\n  .hero { opacity: 1 }\n}",
      { stripCodeFences: true },
    );
    expect(out).toBe("슬라이드 정리 완료.");
    expect(out).not.toMatch(/@scroll-state/i);
  });
});
