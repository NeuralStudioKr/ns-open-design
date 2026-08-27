import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 370 (set59 FOO arrow combo)", () => {
  it("scrubs arrow chrome lines", () => {
    expect(looksLikeDeckCodeDebrisLine("ABCHOST 2 → HOST")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("ABCHOST 2 → HOST\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
