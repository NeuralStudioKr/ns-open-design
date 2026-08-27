import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 396 (@else sanitize)", () => {
  it("cuts @else dump after status", () => {
    expect(
      sanitizeAssistantProseForDisplay("정리 완료.\n@else {.z{opacity:0}}", {
        stripCodeFences: true,
      }),
    ).toBe("정리 완료.");
  });
});
