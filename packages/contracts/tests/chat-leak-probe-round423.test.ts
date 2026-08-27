import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 423 (@else harden keep)", () => {
  it("cuts @else dump after status", () => {
    expect(looksLikeDeckCodeDebrisLine("@else { .x{opacity:0} }")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("정리 완료.\n@else {.z{opacity:0}}", {
        stripCodeFences: true,
      }),
    ).toBe("정리 완료.");
  });
});
