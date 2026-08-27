import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 452 (FOO ➢ keep Hangul)", () => {
  it("keeps Hangul after ➢ chrome", () => {
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ➢ XYZ\n슬라이드 정리 완료", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 정리 완료");
  });
});
